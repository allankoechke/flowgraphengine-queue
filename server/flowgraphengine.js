'use strict'; // http://www.w3schools.com/js/js_strict.asp

const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function getOauthToken(clientid, clientsecret) {
    const response = await axios.post(
        'https://developer.api.autodesk.com/authentication/v2/token',
        {
            scope: 'data:read data:create data:write code:all',
            grant_type: 'client_credentials',
            client_id: clientid,
            client_secret: clientsecret,
        },
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        }
    );
    return response.data.access_token;
};

async function getResourceUploadUrl(accessToken, storageSpaceId, resourceId) {
    const response = await axios.get(
        `https://developer.api.autodesk.com/flow/storage/v1/spaces/${storageSpaceId}/resources/${resourceId}/upload-urls`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        },
    );

    return response.data;
};

async function uploadToSignedUrl(signedUrl, pathToFile) {
    const fileContent = await fs.promises.readFile(pathToFile, 'utf-8');
    const response = await axios.put(
        signedUrl,
        fileContent,
    );
    return response.headers.etag;
};

async function completeUpload(accessToken, storageSpaceId, resourceId, uploadId, etag) {
    const response = await axios.post(
        `https://developer.api.autodesk.com/flow/storage/v1/spaces/${storageSpaceId}/uploads:complete`,
        {
            resourceId,
            uploadId,
            parts: [
                {
                    partId: 1,
                    etag
                }
            ]
        },
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            }
        },
    );
    return response.data.urn;
};

async function submitJob(accessToken, queueId, bifrostGraphUrn, inputFileUrn, { bifrostGraphPath, inputFilePath, taskName }) {
    const bifrostJsonObj = JSON.parse(fs.readFileSync(bifrostGraphPath));
    // console.log(bifrostJsonObj, JSON.stringify(bifrostJsonObj))
    if (!bifrostJsonObj) return null

    try {
        const reponse = await axios.post(
            `https://developer.api.autodesk.com/flow/compute/v1/queues/${queueId}/jobs`,
            {
                name: taskName,
                tags: ['sample app'],
                tasks: [
                    {
                        name: 'execute bifrost graph',
                        type: 'task',
                        // Select the bifrost executor
                        executor: 'bifrost',
                        // Gloabl job inputs. We will provide our input file in the bifrost specific executions section instead of using this for now.
                        // If we would have provided the inputs here instead it would be present for every execution.
                        // For this example, it doesn't matter since we are only running a single frame execution.
                        inputs: [
                        ],
                        limitations: {
                            maxExecutionTimeInSeconds: 600,
                        },
                        payload: {
                            action: 'Evaluate',
                            options: {
                                // Specify which bifrost compound to execute
                                compound: bifrostJsonObj.compounds[0].name,
                                frames: {
                                    start: 1,
                                    end: 1,
                                },
                                // Specify the version of bifrost
                                bifrostVersion: '2.9.0.0'
                            },
                            // Specify the bifrost files to download and load.
                            definitionFiles: [{
                                source: {
                                    uri: bifrostGraphUrn
                                },
                                target: {
                                    path: path.parse(bifrostGraphPath).base
                                },
                            }
                            ],
                            // Specify what value to input into the bifrost graph ports
                            ports: {
                                inputPorts: [
                                    {
                                        name: 'inputFilename',
                                        value: path.parse(inputFilePath).base,
                                        type: 'string',
                                    },
                                    {
                                        name: 'outputFilename',
                                        value: `o-${path.parse(inputFilePath).base}`,
                                        type: 'string',
                                    }
                                ],
                                jobPorts: [],
                            },
                            // parameters for each bifrost execution
                            // in this case we only have a single for frame 1.
                            executions: [
                                {
                                    inputs: [
                                        {
                                            source: {
                                                uri: inputFileUrn,
                                            },
                                            target: {
                                                path: path.parse(inputFilePath).base,
                                            }
                                        },
                                    ],
                                    outputs: [
                                        {
                                            source: {
                                                path: `o-${path.parse(inputFilePath).base}`,
                                            },
                                            target: {
                                                name: `o-${path.parse(inputFilePath).base}`,
                                            }
                                        }
                                    ],
                                    frameId: 1,
                                }
                            ],
                        },
                        requirements: {
                            cpu: 4,
                            memory: 30720,
                        }
                    }
                ]
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                }
            },
        );
        return reponse.data.id;
    } catch (e) {
        console.log("Job submission error: ", e)
        return null
    }
}

async function getTaskExecutions(accessToken, queueId, jobId) {
    const response = await axios.get(
        `https://developer.api.autodesk.com/flow/compute/v1/queues/${queueId}/jobs/${jobId}/executions`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        },
    );
    return response.data;
}

async function getJob(accessToken, queueId, jobId) {
    const response = await axios.get(
        `https://developer.api.autodesk.com/flow/compute/v1/queues/${queueId}/jobs/${jobId}`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        },
    );
    return response.data;
}

async function getLogs(accessToken, queueId, jobId) {
    const response = await axios.get(
        `https://developer.api.autodesk.com/flow/compute/v1/queues/${queueId}/jobs/${jobId}/logs`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        },
    );
    return response.data;
}

async function getOutputs(accessToken, queueId, jobId) {
    const response = await axios.get(
        `https://developer.api.autodesk.com/flow/compute/v1/queues/${queueId}/jobs/${jobId}/outputs`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        },
    );
    return response.data;
}



function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForJobToComplete(accessToken, queueId, jobId) {
    let job = await getJob(accessToken, queueId, jobId);
    while (job.status !== 'SUCCEEDED' && job.status !== 'FAILED' && job.status !== 'CANCELED') {
        await sleep(5000);
        job = await getJob(accessToken, queueId, jobId);
    }
    return job;
}

async function getDownloadUrlForResource(accessToken, spaceId, resourceId) {
    const response = await axios.get(
        `https://developer.api.autodesk.com/flow/storage/v1/spaces/${spaceId}/resources/${resourceId}/download-url`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        },
    );
    return response.data;
}

async function downloadFileFromSignedUrl(signedUrl, destination) {
    const writeStream = fs.createWriteStream(destination);
    const response = await axios.get(
        signedUrl,
        {
            responseType: 'stream',
        }
    );
    response.data.pipe(writeStream)
    return new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
    });
}

async function createDirectory(directory) {
    try {
        await fs.promises.mkdir(directory, { recursive: true });
    } catch (e) {
        // ignore, the directory probably already exist
    }
}

module.exports = {
    getOauthToken,
    getResourceUploadUrl,
    uploadToSignedUrl,
    completeUpload,
    submitJob,
    getTaskExecutions,
    getJob,
    getLogs,
    getOutputs,
    waitForJobToComplete,
    getDownloadUrlForResource,
    downloadFileFromSignedUrl,
    createDirectory
};