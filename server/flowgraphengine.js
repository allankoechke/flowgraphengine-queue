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

async function submitJob(accessToken, queueId, bifrostGraphUrn, { bifrostGraphPath, taskName, startFrame, endFrame }) {
    const bifrostJsonObj = JSON.parse(fs.readFileSync(bifrostGraphPath));
    if (!bifrostJsonObj) return null

    try {
        const response = await axios.post(
            `https://developer.api.autodesk.com/flow/compute/v1/queues/${queueId}/jobs`,
            {
                name: taskName,
                tags: [ "sample app" ],
                tasks: [
                    {
                        name: taskName,
                        type: "task",
                        executor: "bifrost",
                        limitations: {
                            maxExecutionTimeInSeconds: 600
                        },
                        payload: {
                            action: "Evaluate",
                            options: {
                                compound: bifrostJsonObj.compounds[0].name,
                                frames: {
                                    start: startFrame,
                                    end: endFrame
                                },
                                bifrostVersion: "2.11.0.0"
                            },
                            definitionFiles: [
                                {
                                    source: {
                                        uri: bifrostGraphUrn
                                    },
                                    target: {
                                        path: path.parse(bifrostGraphPath).base
                                    }
                                }
                            ],
                            ports: {
                                inputPorts: [
                                    {
                                        name: "filename",
                                        value: "file_cache.####.bob",
                                        type: "string"
                                    }
                                ]
                            },
                            executions: [
                                {
                                    outputs: [
                                        {
                                            source: {
                                                path: "file_cache.{executionId:04}.bob"
                                            },
                                            target: {
                                                name: "file_cache.{executionId:04}.bob"
                                            }
                                        }
                                    ],
                                    templateRange: {
                                        start: startFrame,
                                        end: endFrame
                                    },
                                    frameId: "{executionId}"
                                }
                            ]
                        },
                        requirements: {
                            cpu: 16,
                            memory: 30720
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

        return {
            status: true,
            jobId: response.data.id,
            code: response.status
        }
    } catch (error) {
        console.log("Job submission error: ", error.response)
        var message = "Job submission failed, unknown error!"

        // Handle error
        if (error.response) {
            // The request was made, and the server responded with a status code
            // that falls out of the range of 2xx
            message = error.response.data;
        } else if (error.request) {
            // The request was made, but no response was received
            message = `No response received: ${error.request}`;
        } else {
            // Something happened in setting up the request that triggered an Error
            message = `Error in setting up the request: ${error.message}`;
        }

        return {
            status: false,
            message,
            code: error.response.status
        }
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

async function getLogs(url, accessToken) {
    const response = await axios.get(
        url,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        },
    );
    return response.data;
}

async function getOutputs(url, accessToken) {
    const response = await axios.get(
        url,
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

async function getBatchDownloadUrlForResource(accessToken, spaceId, resourceIds) {
    var arr = [];
    for(var i=0; i<resourceIds.length; i++) {
        arr.push({resourceId: resourceIds[i]})
    }
    const response = await axios.post(
        `https://developer.api.autodesk.com/flow/storage/v1/spaces/${spaceId}/resources:batch-get-download-urls?expirationInMinutes=5`,
        {
            resources: arr
        },
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
    getBatchDownloadUrlForResource,
    downloadFileFromSignedUrl,
    createDirectory
};