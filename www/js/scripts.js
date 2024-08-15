var MyVars = {
    token: "",
    jobs: [],
}

$(document).ready(function () {
    // check URL params
    var url = new URL(window.location.href);
    var client_id = url.searchParams.get("client_id");
    if (client_id) {
        $("#client_id").val(client_id);
    }
    var client_secret = url.searchParams.get("client_secret");
    if (client_secret) {
        $("#client_secret").val(client_secret);
    }

    var auth = $("#authenticate")
    auth.click(function () {
        populateTable();

        // Get the tokens
        getUserToken(function (token) {
            // console.log("Token: ", token)
            MyVars.token = token;

            // Set logged in label, set button disabled
            auth.html('You\'re logged in');
            auth.addClass('disabled');

            // Show create job button
            $("#createNewJob").show();
        });
    });

    // Create Modal Object
    var modal = $("#myModal")

    // Job Tasks
    $("#createNewJob").click(function () {
        modal.show();
    });

    $("#close-modal").click(function () {
        modal.hide();
        clearModalFields();
    })

    populateModal();

    // Hide the add job untill authenticated
    $("#createNewJob").hide()

}); // $(document).ready

function clearModalFields() {
    $('#myModal_body input').val('');
}

function closeModal() {
    $("#myModal").hide();
    clearModalFields();
}

function openModal() {
    $("#myModal").show();
    clearModalFields();
}

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function populateTable() {
    // Clear table
    $("#tableBody > tr").remove();

    var table = $("tbody");

    MyVars.jobs.forEach((job, index, _) => {
        hasFiles = false;
        

        var row = `<tr>
            <th scope="row">${index + 1}</th>
            <td>${job.name}</td>
            <td>${job.jobId==="" ? "---" : job.jobId}</td>
            <td>${job.status}</td>
            <td> <ul>`

            console.log(job)

            job.outputs.forEach((file) => {
                hasFiles = true;
                row += `<li><a href="#" onclick="getDownloadUrlForResource('${file.name}', '${file.spaceId}', '${file.resourceId}'); return false;">${file.name}</a></li>`
            }) 
    
            job.logs.forEach((file) => {
                hasFiles = true;
                row += `<li><a href="#" onclick="getDownloadUrlForResource('${file.name}', '${file.spaceId}', '${file.resourceId}'); return false;">${file.name}</a></li>`
            })

            if(!hasFiles)                
                row += `---`

        row += "</ul> </td> </tr>"

        table.append(row);
    });
}

function getUserToken(callback) {
    if (callback) {
        var client_id = $('#client_id').val();
        var client_secret = $('#client_secret').val();

        console.log(client_id, client_secret)

        $.ajax({
            url: '/user/token',
            type: "POST",
            contentType: "application/json",
            dataType: "json",
            data: JSON.stringify({
                client_id: client_id,
                client_secret: client_secret
            }),
            success: function (data) {
                if (data.status) {
                    MyVars.token = data.token;
                    console.log('Returning new token (User Authorization): ' + MyVars.token);
                    callback(data.token);
                } else {
                    alert("Authentication failed", data.message)
                }
            },
            error: function (err, text) {
                console.log("Authentication failed", err.responseText)
                alert("Authentication failed", err.responseText)
            }
        });
    } else {
        console.log('Returning saved token (User Authorization): ' + MyVars.token);

        return MyVars.token;
    }
}

function populateModal() {
    var inputs = {
        'jobName': {
            'text': 'Job Name',
            'placeholder': '<name for the new task>',
            'value': ''
        },
        'bifrostGraph': {
            'file': 'Bifrost Graph (.json)',
            'text': 'Bifrost Graph (.json)',
            'placeholder': '<Bifrost Graph Exported from Maya>',
            'value': '',
            'type': ".json"
        },
        'inputFile': {
            'file': 'Input File (USD)',
            'text': 'Input File (USD)',
            'placeholder': '<input USD file>',
            'value': '',
            'type': ".usd"
        }
    };

    getInputs('Create New Job', inputs, () => {
        // Handle onCreate action
        // console.log(inputs)
    });
}

// 'inputs' is an array of objects with 'text', 'placeholder' and 'value' parameters 
function getInputs(title, inputs, callback) {
    console.log('getInputs');
    const modelDialog = 'myModal'

    $('#myModal_title').html(title)
    $('#myModal_body').html('')

    Object.keys(inputs).forEach(function (key) {
        let inputGroup = $('<div class="input-group mb-3">');
        //inputGroup.addClass('input-group mb-3');

        let input = inputs[key];

        if (input.file !== undefined) {
            inputGroup.html(`
                <div class="input-group-addon">
                    <span class="input-group-text" id="${modelDialog}_${key}_prepend">${input.text}</span>
                </div>
                <input id="${modelDialog}_${key}" type="file" accept="${input.type}" class="form-control" aria-label="${modelDialog}_${key}" aria-describedby="${modelDialog}_${key}_prepend" />
                `)
        } else if (input.multiline) {
            inputGroup.html(`
                <div class="input-group-addon">
                    <span class="input-group-text" id="${modelDialog}_${key}_prepend">${input.text}</span>
                </div>
                `)
            let textarea = $(`<textarea id="${modelDialog}_${key}" type="text" class="form-control" placeholder="${input.placeholder}" aria-label="${modelDialog}_${key}" aria-describedby="${modelDialog}_${key}_prepend" />`)
            textarea.val(`${input.value}`)
            inputGroup.append(textarea)
        } else {
            inputGroup.html(`
                <div class="input-group-addon">
                    <span class="input-group-text" id="${modelDialog}_${key}_prepend">${input.text}</span>
                </div>
                <input id="${modelDialog}_${key}" type="text" class="form-control" placeholder="${input.placeholder}" aria-label="${modelDialog}_${key}" aria-describedby="${modelDialog}_${key}_prepend" value="${input.value}" />
                `)
        }

        if (input.options || input.json) {
            MyVars.options[`${modelDialog}_${key}`] = input.options

            let dropdownSection = $('<div class="input-group-btn">')

            let dropdownGroup = $('<div class="dropdown btn-group" role="group">')
            dropdownGroup.html(`
                <button class="btn btn-default dropdown-toggle" type="button" id="${modelDialog}_${key}_dropdown" data-toggle="dropdown" aria-haspopup="true" aria-expanded="true">
                    <span class="caret"></span>
                </button>
                `)
            dropdownSection.append(dropdownGroup)

            let dropdownMenu = $(`<ul class="dropdown-menu" aria-labelled-by="${modelDialog}_${key}_dropdown">`);
            for (let optionKey in input.options) {
                let listItem = $('<li>')
                let href = $(`<a href="#">${optionKey}</a>`)
                href.click(() => {
                    fillWithValue(`${modelDialog}_${key}`, `${optionKey}`)
                })
                listItem.append(href)
                dropdownMenu.append(listItem)
            }
            if (input.json) {
                let separator = $('<li role="separator" class="divider"></li>')
                dropdownMenu.append(separator)

                let listItem = $('<li>')
                let href = $(`<a href="#">Verify json</a>`)
                href.click(() => {
                    verifyJson(`${modelDialog}_${key}`)
                })
                listItem.append(href)
                dropdownMenu.append(listItem)
            }
            dropdownGroup.append(dropdownMenu)

            inputGroup.append(dropdownSection)
        }

        $('#myModal_body').append(inputGroup)
    })

    // Start a new job when submitted
    $('#myModal_Create').on('click', startNewJob);
}

async function startNewJob() {
    var jobName = $("#myModal_jobName");
    var bifrostGraph = $("#myModal_bifrostGraph");
    var inputFile = $("#myModal_inputFile");

    if (validateFiles(jobName, bifrostGraph, inputFile)) {
        // Disable close & submit button
        // TODO

        console.log(inputFile.prop("files")[0])
        console.log(bifrostGraph.prop("files")[0])

        const formData = new FormData();
        formData.append('input_files', inputFile.prop("files")[0]);
        formData.append('bifrost_files', bifrostGraph.prop("files")[0]);
        formData.append('job_name', jobName.val());

        var id = uuidv4();

        var job = {
            uuid: id,
            name: jobName.val(),
            inputFiles: [],
            jobId: "",
            queueId: "",
            files: [],
            status: "UPLOADING",
            outputs: [],
            logs: [],
            anotherStatusRequestPending: false
        }

        closeModal();
        MyVars.jobs.push(job);
        populateTable();

        $.ajax({
            url: '/jobs',
            type: "POST",
            data: formData,
            processData: false,
            contentType: false,
            success: function (data) {
                if (data.status) {
                    // console.log("Job Success: ", data)
                    MyVars.jobs = MyVars.jobs.map(task => task.uuid === id ? { ...task, status: "QUEUED",  jobId: data.jobId, queueId: data.queueId} : task);
                    populateTable();

                    const intervalId = setInterval(() => {
                        // Call the function and pass the handle (intervalId) to it
                        checkStatus(data.jobId, data.queueId, intervalId);
                    }, 5000);
                } else {                    
                    MyVars.jobs = MyVars.jobs.map(job => job.uuid === id ? { ...job, status: "UPLOAD FAILED"} : job);
                }
            },
            error: function (err, text) {
                MyVars.jobs = MyVars.jobs.map(job => job.uuid === id ? { ...job, status: "UPLOAD FAILED"} : job);
                // console.log("Failed to create JOB: ", err.responseText)
                alert(err.responseText)
            },
            headers: {
                'Authorization': `Bearer ${MyVars.token}`
            },
        });

        // Update the table
        populateTable();
    }

    async function checkStatus(jobId, queueId, intervalId) {
        // Update job item
        var foundIndex = MyVars.jobs.findIndex(job => job.jobId === jobId);

        if (foundIndex>=0 && !MyVars.jobs[foundIndex].anotherStatusRequestPending) {
            MyVars.jobs = MyVars.jobs.map(job => job.jobId === jobId ? { ...job, anotherStatusRequestPending: true} : job);

            $.ajax({
                url: '/job/status',
                type: "POST",
                contentType: "application/json",
                headers: {
                    "Authorization": `Bearer ${MyVars.token}`,
                },
                dataType: "json",
                data: JSON.stringify({ jobId, queueId }),
                success: function (data) {
                    MyVars.jobs = MyVars.jobs.map(job => job.jobId === jobId ? { ...job, status: data.status, logs: data.logs, outputs: data.outputs } : job);
                    populateTable();

                    if (data.status === 'SUCCEEDED' || data.status === 'FAILED' || data.status === 'CANCELED') {
                        clearInterval(intervalId);
                    }

                },
                error: function (err, text) {
                    clearInterval(intervalId);
                    console.log("Job Status Failed: ", err, text)
                    // alert(`Job '${jobId}' Status Check failed\n\n` + err.responseText)
                }
            });

            MyVars.jobs = MyVars.jobs.map(job => job.jobId === jobId ? { ...job, anotherStatusRequestPending: false} : job);
            populateTable();
        }
    }

}

function validateFiles(jobName, bifrostGraph, inputFile) {
    if (!jobName || jobName.val() === "") {
        alert("Job Name is required");
        return false;
    }

    if (!bifrostGraph || bifrostGraph.prop("files").length === 0 || bifrostGraph.prop("files")[0].name === "" || !bifrostGraph.prop("files")[0].name.endsWith(".json")) {
        alert("Input File Error\n\nBifrost Graph is required, please select a graph file with a .json extension.");
        return false;
    }

    if (!inputFile || inputFile.prop("files").length === 0 || inputFile.prop("files")[0].name === "" || !inputFile.prop("files")[0].name.endsWith(".usd")) {
        alert("Input File Error\n\nInput file is required, please select a file with a .usd extension.");
        return false;
    }

    return true;
}

function getDownloadUrlForResource(name, spaceId, resourceId) {
    $.ajax({
        url: `https://developer.api.autodesk.com/flow/storage/v1/spaces/${spaceId}/resources/${resourceId}/download-url`,
        type: "GET",
        headers: {
            'Authorization': `Bearer ${MyVars.token}`,
        },
        success: function (data) {
            const a = document.createElement('a');
            a.href = data.url;
            a.download = `${name}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        },
        error: function (err, text) {
            console.log("Fetching signed URL failed", text, err.responseText)
            alert("Fetching signed URL failed: " + err.responseText)
        }
    });
}