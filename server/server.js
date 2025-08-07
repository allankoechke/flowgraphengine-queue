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
const axios = require('axios');
const open = require('open'); // npm install open
// const _ = require("lodash");

// prepare our API endpoint routing
var fge = require('./flowgraphengine');
var app = express();

const APP_ROOT_DIR = path.join(__dirname + '/../'); // Application root directory
const APP_OUTPUT_DIR = path.join(APP_ROOT_DIR, "Outputs")

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

// Handle POST requests to root path
// app.post('/sendjob', (req, res) => {
//     // Extract URL parameters
//     const client_id = req.query.client_id;
//     const client_secret = req.query.client_secret;
//     const input_path = req.query.input_path;

//     // Validate required parameters
//     if (!client_id || !client_secret) { // TODO: || !input_path) {
//         return res.status(400).send({
//             status: false,
//             message: 'Missing required parameters: client_id, client_secret, and input_path'
//         });
//     }

//     // Execute your extra code here
//     // 1. Authenticate with APS
//     // 2. Create automatically a job, based on the file, taking the file name as job name, default frame parameters
//     // 3. Update the html with that
//     // 4. Send the job to the Flow Graph Engine


//     // You can either:
//     // 1. Serve the same static content as GET
//     res.sendFile(path.join(__dirname, '../www/index.html'));

// });

// Handle POST requests to /sendjob with authentication and opening the main page
app.post('/sendjob', async (req, res) => {
    const client_id = req.query.client_id;
    const client_secret = req.query.client_secret;
    const input_path = req.query.input_path;

    if (!client_id || !client_secret || !input_path) {
        return res.status(400).send({
            status: false,
            message: 'Missing required parameters: client_id, client_secret, and input_path'
        });
    }

    try {
        // Authenticate via /user/token
        const tokenRes = await axios.post(`http://localhost:${app.get('port')}/user/token`, {
            client_id,
            client_secret
        });

        if (!tokenRes.data.status || !tokenRes.data.token) {
            return res.status(403).send({
                status: false,
                message: 'Authentication failed'
            });
        }

        const token = tokenRes.data.token;

        // Open the main HTML page in the default browser, passing token and input_path as query params
        const url = `http://localhost:${app.get('port')}/index.html?token=${encodeURIComponent(token)}&input_path=${encodeURIComponent(input_path)}`;
        await open.default(url);

        // Optionally, you can trigger job creation here or let the frontend handle it
        return res.status(200).send({
            status: true,
            message: 'Authenticated and opened main page in browser',
            token
        });
    } catch (err) {
        console.error(err);
        return res.status(500).send({
            status: false,
            message: 'Internal server error',
            error: err.toString()
        });
    }
});

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
            // let inputUsd = req.files.input_files

            let now = Date.now()
            let bifrostGraphName = `${now}-${bifrostGraph.name}`
            // let inputUsdName = `${now}-${inputUsd.name}`

            let bifrostfilepath = path.join(__dirname, `../files/uploads/${bifrostGraphName}`)
            // let inputusdfilepath = path.join(__dirname, `../files/uploads/${inputUsdName}`)

            bifrostGraph.mv(bifrostfilepath);
            // inputUsd.mv(inputusdfilepath);

            return await prepareRequest(req, res, req.token, bifrostfilepath); //, inputusdfilepath)
        }
    } catch (err) {
        console.log("Request failed: ", err)
        res.status(500).send({ error: err.toString() });
    }
});

app.post('/job/status', extractToken, async (req, res) => {
    console.log("\n\n-- Checking job status ...")
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
        const outputsDirectory = path.join(APP_OUTPUT_DIR, req.body.jobId)
        const logsDirectory = path.join(outputsDirectory, ".logs")

        if (job.status !== 'SUCCEEDED' && job.status !== 'FAILED' && job.status !== 'CANCELED') {
            console.log("Job Status: ", job.status)
            return res.status(200).send({
                status: job.status,
                logs: [],
                outputs: [],
                error: null
            })
        }

        // Create paths if they dont exist already
        await fge.createDirectory(outputsDirectory)
        await fge.createDirectory(logsDirectory)

        let queueId = req.body.queueId;
        let jobId = req.body.jobId;
        var resObj = { status: job.status, error: null, outputs: [], logs: [], dir: outputsDirectory.replace(/\\/g, '/').toString() + "/" };

        try {
            var outputs = undefined;
            var logsUrl = `https://developer.api.autodesk.com/flow/compute/v1/queues/${queueId}/jobs/${jobId}/logs`
            console.log("-- Fetching job logs ...")

            do {
                // Downloading outputs for the job
                outputs = await fge.getLogs(logsUrl, req.token);

                // Map to hold
                let logsMap = new Map();

                const BATCH = 25;
                const COUNT = Math.ceil(outputs.results.length / BATCH)

                for (var i = 0; i < COUNT; i++) {
                    var batch = [];

                    for (var j = 0; j < BATCH; j++) {
                        const ind = i * BATCH + j;

                        // Exit if index exceeds length of array
                        if (ind >= outputs.results.length) break;

                        // Create a map of resourceId -> Resource Name from the path to be used later
                        logsMap.set(outputs.results[ind].resourceId, outputs.results[ind].path.split('/').pop())

                        // Add items to the batch
                        batch.push(outputs.results[ind].resourceId)
                    }

                    // Fetch the URLs from using the batch format
                    const res = await fge.getBatchDownloadUrlForResource(req.token, outputs.results[0].spaceId, batch);

                    const downloadOutputPromises = res.results.map(async (result) => {
                        var filename = logsMap.get(result.resourceId);
                        resObj.logs.push(filename);
                        const outputFile = path.join(logsDirectory, filename);
                        await fge.downloadFileFromSignedUrl(result.url, outputFile);
                    })

                    await Promise.all(downloadOutputPromises);

                    logsUrl = (outputs && outputs.pagination && outputs.pagination.nextUrl) ? `https://developer.api.autodesk.com${outputs.pagination.nextUrl}` : ""
                }
            } while (outputs && outputs.pagination && outputs.pagination.nextUrl && logsUrl !== "")
        }
        catch (e) { }

        try {
            var outputs = undefined;
            var outputsUrl = `https://developer.api.autodesk.com/flow/compute/v1/queues/${queueId}/jobs/${jobId}/outputs`

            console.log("-- Fetching job outputs ...")

            do {
                // Downloading outputs for the job
                outputs = await fge.getOutputs(outputsUrl, req.token);

                // Output Map for resourceId -> filename 
                let outputsMap = new Map();

                // Batch URL download has a max cap of 25 URLs per request
                const BATCH = 25;
                const COUNT = Math.ceil(outputs.results.length / BATCH)

                for (var i = 0; i < COUNT; i++) {
                    var batch = [];

                    for (var j = 0; j < BATCH; j++) {
                        const ind = i * BATCH + j;

                        // Exit if index exceeds length of array
                        if (ind >= outputs.results.length) break;

                        // Create a map of resourceId -> Resource Name from the path to be used later
                        outputsMap.set(outputs.results[ind].resourceId, outputs.results[ind].path.split('/').pop())

                        // Add items to the batch
                        batch.push(outputs.results[ind].resourceId)
                    }

                    // Fetch the URLs from using the batch format
                    const res = await fge.getBatchDownloadUrlForResource(req.token, outputs.results[0].spaceId, batch);

                    const downloadOutputPromises = res.results.map(async (result) => {
                        var filename = outputsMap.get(result.resourceId);
                        resObj.outputs.push(filename);
                        const outputFile = path.join(outputsDirectory, filename);
                        await fge.downloadFileFromSignedUrl(result.url, outputFile);
                    })

                    await Promise.all(downloadOutputPromises);

                    outputsUrl = (outputs && outputs.pagination && outputs.pagination.nextUrl) ? `https://developer.api.autodesk.com${outputs.pagination.nextUrl}` : ""
                }
            } while (outputs && outputs.pagination && outputs.pagination.nextUrl && outputsUrl !== "")
        }
        catch (e) { }

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

async function prepareRequest(req, res, access_token, bifrostGraphPath) {
    console.log("Prepare request ...")
    const storageSpaceId = 'scratch:@default';

    // use the personal queue for our app
    const queueId = '@default';

    // Upload bifrost graph file (addTrees.json)
    console.log('Uploading bifrost graph file');
    const getGraphUploadUrlResponse = await fge.getResourceUploadUrl(access_token, storageSpaceId, path.parse(bifrostGraphPath).base);
    const bifrostGraphEtag = await fge.uploadToSignedUrl(getGraphUploadUrlResponse.urls[0].url, bifrostGraphPath);
    const bifrostGraphUrn = await fge.completeUpload(access_token, storageSpaceId, getGraphUploadUrlResponse.upload.resourceId, getGraphUploadUrlResponse.upload.id, bifrostGraphEtag);
    console.log('Bifrost graph file uploaded');

    // Submit job
    let taskName = req.body.job_name
    let startFrame = parseInt(req.body.startFrame) <= 0 ? 1 : parseInt(req.body.startFrame)
    let endFrame = parseInt(req.body.endFrame) <= 0 ? 1 : parseInt(req.body.endFrame)

    const jobResponse = await fge.submitJob(access_token, queueId, bifrostGraphUrn, { bifrostGraphPath, taskName, startFrame, endFrame });

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