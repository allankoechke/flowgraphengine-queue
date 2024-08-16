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
const path = require('path');
const fileUpload = require("express-fileupload");
const cors = require("cors");
const bodyParser = require('body-parser');
const morgan = require('morgan');
// const _ = require("lodash");

// prepare our API endpoint routing
var fge = require('./flowgraphengine');
var app = express();

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

            bifrostGraph.mv(bifrostfilepath);
            inputUsd.mv(inputusdfilepath);

            return await prepareRequest(req, res, req.token, bifrostfilepath, inputusdfilepath)
        }
    } catch (err) {
        console.log("Request failed: ", err)
        res.status(500).send({error: err.toString()});
    }
});

app.post('/job/status', extractToken, async (req, res) => {
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
        // console.log(JSON.stringify(job))

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
        var resObj = { status: job.status, error: null, outputs: [], logs: [] };

        // Downloading logs for the job
        const logs = await fge.getLogs(req.token, queueId, jobId);
        const downloadLogPromises = logs.results.map(async (result, index) => {
                var obj = {
                    name: `log_${index+1}.log`,
                    spaceId: result.spaceId, 
                    resourceId: result.resourceId
                }
                resObj.logs.push(obj);
        });

        // Wait for files to be written
        await Promise.all(downloadLogPromises);

        // Downloading outputs for the job
        const outputs = await fge.getOutputs(req.token, queueId, jobId);
        const downloadPromises = outputs.results.map(async (result, index) => {
            try {
                // const downloadUrl = await fge.getDownloadUrlForResource(req.token, result.spaceId, result.resourceId);
                var obj = {
                    name: `output_${index+1}.usd`,
                    spaceId: result.spaceId, 
                    resourceId: result.resourceId
                }
                resObj.outputs.push(obj);
            } catch (err) {
                console.log("Output Error: ", err);
            }
        });

        // Wait for files to be written
        await Promise.all(downloadPromises);

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
    const jobResponse = await fge.submitJob(access_token, queueId, bifrostGraphUrn, inputFileUrn, { bifrostGraphPath, inputFilePath, taskName });

    if (!jobResponse.status) {
        console.log("Job submission task failed")
        return res.status(jobResponse.code).send({
            status: false,
            message: jobResponse.message
        });
    }

    const jobId = jobResponse.jobId;
    console.log(`Job submitted, id: ${jobId}`);

    return res.status(200).send({
        status: true,
        jobId,
        queueId
    });
};


module.exports = app;