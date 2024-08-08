/////////////////////////////////////////////////////////////////////
// Copyright (c) Autodesk, Inc. All rights reserved
// Written by Autodesk Partner Development
//
// Permission to use, copy, modify, and distribute this software in
// object code form for any purpose and without fee is hereby granted,
// provided that the above copyright notice appears in all copies and
// that both that copyright notice and the limited warranty and
// restricted rights notice below appear in all supporting
// documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
/////////////////////////////////////////////////////////////////////
'use strict';

var express = require('express');
var cookieParser = require('cookie-parser');
var session = require('cookie-session');
const path = require('path');
const fileUpload = require("express-fileupload");
const cors = require("cors");
const bodyParser = require('body-parser');
const morgan = require('morgan');
const _ = require("lodash");
const exec = require('child_process').exec;

// prepare our API endpoint routing
var fge = require('./flowgraphengine');
var app = express();

// this session will be used to save the oAuth token
app.use(cookieParser());
app.set('trust proxy', 1) // trust first proxy - HTTPS on Heroku 
app.use(session({
    secret: "1234567890", // config.sessionSecret,
    maxAge: 1000 * 60 * 60, // 1 hours to expire the session and avoid memory leak
}));

// Middleware to extract access token
function extractToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        req.token = token;
        next();
    } else {
        res.status(401).send('Access token is missing');
    }
}

// enable files upload
app.use(fileUpload({
    createParentPath: true
}));

//add other middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan('dev'));

console.log(__dirname)

// prepare server routing
app.use('/', express.static(__dirname + '/../www')); // redirect static calls
app.use('/js', express.static(__dirname + '/../node_modules/bootstrap/dist/js')); // redirect static calls
app.use('/js', express.static(__dirname + '/../node_modules/jquery/dist')); // redirect static calls
app.use('/css', express.static(__dirname + '/../node_modules/bootstrap/dist/css')); // redirect static calls
app.use('/fonts', express.static(__dirname + '/../node_modules/bootstrap/dist/fonts')); // redirect static calls
app.set('port', process.env.PORT || 3000); // main port

function validateFiles(req, res) {
    return true;
}

app.post('/user/token', async (req, res) => {
    console.log(req.body)
    console.log("Logging in ...")
    if (!req.body.client_id) {
        return res.send({
            status: false,
            message: 'Client ID is required'
        });
    }

    if (!req.body.client_secret) {
        return res.send({
            status: false,
            message: 'Client Secret is required'
        });
    }

    const accessToken = await fge.getOauthToken(req.body.client_id, req.body.client_secret);

    if (accessToken === "")
        return res.status(403).send({
            status: false,
            message: 'Client log in failed'
        });

    else
        return res.status(200).send({
            status: true,
            message: 'Logged in',
            token: accessToken
        });
});

// Upload endpoint
app.post('/jobs', extractToken, async (req, res) => {
    try {
        if (!req.body.job_name) {
            return res.send({
                status: false,
                message: 'Job name not provided'
            });
        }

        if (!req.files.input_files) {
            return res.send({
                status: false,
                message: 'Input file was not provided'
            });
        }

        if (!req.files.bifrost_files) {
            return res.send({
                status: false,
                message: 'Bifrost file input was not provided.'
            });
        }

        if (!validateFiles(req, res)) {
            return res.send({
                status: false,
                message: 'Required files/inputs missing! Please select one .json file and one .usd file.'
            });
        }

        else {
            let bifrostGraph = req.files.bifrost_files
            let inputUsd = req.files.input_files

            let now = Date.now()
            let bifrostGraphName = `${now}-${bifrostGraph.name}`
            let inputUsdName = `${now}-${inputUsd.name}`

            let bifrostfilepath = path.join(__dirname, `../files/uploads/${bifrostGraphName}`)
            let inputusdfilepath = path.join(__dirname, `../files/uploads/${inputUsdName}`)

            console.log("Saving files started ...")
            bifrostGraph.mv(bifrostfilepath);
            inputUsd.mv(inputusdfilepath);
            console.log("Saving files finished ...")

            return await prepareRequest(req, res, req.token, bifrostfilepath, inputusdfilepath)
        }
    } catch (err) {
        console.log("Request failed: ", err)
        res.status(500).send({error: err.toString()});
    }
});

app.post('/job/status', extractToken, async (req, res) => {
    console.log("DIRNAME: ", __dirname)

    try {
        if (!req.body.jobId) {
            return res.send({
                status: false,
                message: 'Job Id Required'
            });
        }

        if (!req.body.queueId) {
            return res.send({
                status: false,
                message: 'Queue ID required'
            });
        }

        let job = await fge.getJob(req.token, req.body.queueId, req.body.jobId);
        console.log(JSON.stringify(job))

        if (job.status !== 'SUCCEEDED' && job.status !== 'FAILED' && job.status !== 'CANCELED') {
            console.log("Job Status: ", job.status)
            return res.status(200).send({
                status: job.status,
                logs: [],
                outputs: [],
                error: null
            })
        }

        let queueId = req.body.queueId;
        let jobId = req.body.jobId;

        const ts = Date.now();
        var logsArray = [];
        var outputArray = [];
        var resObj = { status: job.status, error: null, outputs: [], logs: [] };

        // Downloading logs for the job
        const logsDirectory = path.join(__dirname, `../files/outputs/${jobId}`);
        console.log(`Downloading logs in ${logsDirectory}`);
        fge.createDirectory(logsDirectory);
        const logs = await fge.getLogs(req.token, queueId, jobId);
        const downloadLogPromises = logs.results.map(async (result, index) => {
            const downloadUrl = await fge.getDownloadUrlForResource(req.token, result.spaceId, result.resourceId);
            let log = path.join(logsDirectory, `log_${index}.log`)
            logsArray.push(log.toString())
            resObj.logs.push(log.toString())
            await fge.downloadFileFromSignedUrl(downloadUrl.url, log);
        });

        console.log("Waiting for logs to be downloaded ...")
        // Wait for files to be written
        await Promise.all(downloadLogPromises);

        // Downloading outputs for the job
        const outputsDirectory = path.join(__dirname, `../files/outputs/${jobId}`);
        console.log(`Downloading outputs in ${outputsDirectory}`);
        fge.createDirectory(outputsDirectory);
        const outputs = await fge.getOutputs(req.token, queueId, jobId);
        const downloadPromises = outputs.results.map(async (result, index) => {
            try {
                const downloadUrl = await fge.getDownloadUrlForResource(req.token, result.spaceId, result.resourceId);
                const outputFile = path.join(outputsDirectory, `output_${index}.usd`);
                resObj.outputs.push(outputFile.toString());
                await fge.downloadFileFromSignedUrl(downloadUrl.url, outputFile);
            } catch (err) {
                console.log("Output Error: ", err);
            }
        });

        console.log("Downloading the output files, this may take some time")
        // Wait for files to be written
        // await Promise.all(downloadPromises);

        if (job.status === 'FAILED') {
            const taskExecutions = await fge.getTaskExecutions(req.token, queueId, jobId);
            const taskError = taskExecutions?.results?.[0].error;
            if (taskError) {
                console.log(JSON.stringify(taskError));
                resObj.error = JSON.stringify(taskError);
            }
        }

        return res.status(200).send(resObj)

    } catch (err) {
        res.status(500).send(err);
    }
});

app.use("/dir", async(req, res) => {
    if(!req.body.path) {
        console.log("Path not specified")
        return res.status(403).send("No file path specified")
    }

    return openDirectory(res, req.body.path)
})

async function prepareRequest(req, res, access_token, bifrostGraphPath, inputFilePath) {
    console.log("Prepare request ...")
    const storageSpaceId = 'scratch:@default';

    // use the personal queue for our app
    const queueId = '@default';

    // Upload input file (plane.usd)
    console.log('Uploading input file');
    const getInputFileUploadUrlResponse = await fge.getResourceUploadUrl(access_token, storageSpaceId, path.parse(inputFilePath).base);
    const inputFileEtag = await fge.uploadToSignedUrl(getInputFileUploadUrlResponse.urls[0].url, inputFilePath);
    const inputFileUrn = await fge.completeUpload(access_token, storageSpaceId, getInputFileUploadUrlResponse.upload.resourceId, getInputFileUploadUrlResponse.upload.id, inputFileEtag);
    console.log('Input File uploaded');

    // Upload bifrost graph file (addTrees.json)
    console.log('Uploading bifrost graph file');
    const getGraphUploadUrlResponse = await fge.getResourceUploadUrl(access_token, storageSpaceId, path.parse(bifrostGraphPath).base);
    const bifrostGraphEtag = await fge.uploadToSignedUrl(getGraphUploadUrlResponse.urls[0].url, bifrostGraphPath);
    const bifrostGraphUrn = await fge.completeUpload(access_token, storageSpaceId, getGraphUploadUrlResponse.upload.resourceId, getGraphUploadUrlResponse.upload.id, bifrostGraphEtag);
    console.log('Bifrost graph file uploaded');

    // Submit job
    let taskName = req.body.job_name
    console.log("Task Name: ", taskName)
    const jobId = await fge.submitJob(access_token, queueId, bifrostGraphUrn, inputFileUrn, { bifrostGraphPath, inputFilePath, taskName });

    if (!jobId) {
        console.log("Job submission task failed")
        return res.status(500).send({
            status: false,
            message: "Job submission failed, internal error"
        });
    }

    console.log(`Job submitted, id: ${jobId}`);
    return res.status(200).send({
        status: true,
        jobId,
        queueId
    });
};

function openDirectory(res, dirPath) {
    let absolutePath = path.dirname(dirPath).replace(/[\\\/]+$/, '').replace(/\/+/g, '\\').replace(/\\\\+/g, '\\');
    console.log(absolutePath.toString())
    
    let command;

    switch (process.platform) {
        case 'win32': // Windows
            command = `explorer "${absolutePath}"`;
            break;
        case 'darwin': // macOS
            command = `open "${absolutePath}"`;
            break;
        case 'linux': // Linux
            command = `xdg-open "${absolutePath}"`;
            break;
        default:
            console.error('Unsupported platform:', process.platform);
            return res.status(404).send({"error": "Unsupported platform"})
    }

    exec(command, (error) => {
        if (error) {
            console.error('Error opening directory:', error);
            return res.send({"error": "Failed to open file directory"})
        } else {
            console.log('Directory opened successfully:', absolutePath);
            return res.status(200).send({"message": "Folder opened"})
        }
    });
}

module.exports = app;