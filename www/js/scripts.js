var jobs = [];

$(document).ready(function () {
    console.log("Hello World")
    //debugger;
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
        console.log("Authenticate")

        populateTable();
        // Get the tokens
        get2LegToken(function (token) {
            MyVars.token2Leg = token;

            auth.html('You\'re logged in');

            auth.addClass('disabled');
        });
    });

    // Create Modal Object
    var modal = $("#myModal")

    // Job Tasks
    $("#createNewJob").click(function () {
        modal.show()

        // Open the modal dialog
        console.log("Create New Job Dialog")

        var job = {
            name: "New Job",
            uuid: uuidv4(),
            status: "PENDING",
            files: ["log_0.log", "output_0.usd"]
        }

        jobs.push(job);

        populateTable();
    });
  
    $("#close-modal").click(function() {
        modal.hide();
        clearModalFields();
    })

    modal.on('hidden.bs.modal', function () {
        console.log("Close")
       //  $('#myModal_Create').off('click', onCreate);
    });

    $("myModal").on("shown.mdb.modal", () => { console.log(
        "Shown!"
    )});

    modal.on("hide", () => { console.log("Hidden")})

    populateModal();

    function clearModalFields() {
        $('#myModal_body input').val('');
    }

}); // $(document).ready

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

    jobs.forEach((job, index, _) => {
        filesColArray = []
        job.files.forEach((file) => {
            filesColArray.push(`<a href="#">${file}</a>`)
        })

        var row = `<tr>
            <th scope="row">${index + 1}</th>
            <td>${job.name}</td>
            <td>${job.uuid}</td>
            <td>${job.status}</td>
            <td> <div class="d-flex flex-row">`
        row += filesColArray.join(", ")
        row += "</div> </td> </tr>"

        table.append(row);
    });
}

function base64encode(str) {
    var ret = "";
    if (window.btoa) {
        ret = window.btoa(str);
    } else {
        // IE9 support
        ret = window.Base64.encode(str);
    }

    // Remove ending '=' signs
    // Use _ instead of /
    // Use - insteaqd of +
    // Have a look at this page for info on "Unpadded 'base64url' for "named information" URI's (RFC 6920)"
    // which is the format being used by the Model Derivative API
    // https://en.wikipedia.org/wiki/Base64#Variants_summary_table
    var ret2 = ret.replace(/=/g, '').replace(/[/]/g, '_').replace(/[+]/g, '-');

    console.log('base64encode result = ' + ret2);

    return ret2;
}

function logoff() {
    $.ajax({
        url: '/user/logoff',
        success: function (oauthUrl) {
            location.href = oauthUrl;
        }
    });
}

function get2LegToken(callback) {

    if (callback) {
        var client_id = $('#client_id').val();
        var client_secret = $('#client_secret').val();
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
                MyVars.token2Leg = data.token;
                console.log('Returning new 3 legged token (User Authorization): ' + MyVars.token2Leg);
                callback(data.token, data.expires_in);
                /// showProgress()
            },
            error: function (err, text) {
                // showProgress(err.responseText, 'failed');
                console.log(err.responseText)
            }
        });
    } else {
        console.log('Returning saved 3 legged token (User Authorization): ' + MyVars.token2Leg);

        return MyVars.token2Leg;
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
        console.log(inputs)
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

    var onCreate = function () {
        console.log('onCreate');

        // Update values
        Object.keys(inputs).forEach(function (key) {
            let input = inputs[key];
            input.value = $(`#${modelDialog}_${key}`).val();
        })

        callback();
    }

    $('#myModal_Create').on('click', onCreate);
}

async function startNewJob() {
    if (validateFiles()) {
        const button = document.getElementById('addTaskButton');
        button.disabled = true;
        button.innerHTML = 'Processing... <div class="spinner"></div>';

        const submitBtn = document.getElementById("fileUpload");

        const fileInput = document.getElementById("fileUpload");
        const name = document.getElementById("taskName").value;
        let selectedFiles = []

        const formData = new FormData();
        for (const file of fileInput.files) {
            selectedFiles.push(file.name)
            formData.append('taskFiles', file);
        }

        formData.append('taskName', name);

        try {
            const response = await fetch('http://127.0.0.1:3000/task', {
                method: 'POST',
                body: formData,
                headers: {
                    'Authorization': `Bearer ${token}`
                },
            });

            if (!response.ok) {
                throw new Error('Network response was not ok ' + response.statusText);
            }

            const data = await response.json();

            // console.log(data)

            var newJob = {
                jobId: data.jobId,
                queueId: data.queueId,
                taskName: name,
                files: selectedFiles,
                status: "QUEUED",
                outputs: [],
                logs: []
            }

            jobs = [...jobs, newJob]

            document.getElementById("fileUpload").value = "";
            document.getElementById("taskName").value = "";
            document.getElementById("modalDialog").close();

            const intervalId = setInterval(() => {
                // Call the function and pass the handle (intervalId) to it
                checkStatus(data.jobId, data.queueId, intervalId);
            }, 5000);

        } catch (error) {
            console.error('There has been a problem with your fetch operation:', error);
            alert('There has been a problem with your fetch operation:', error)
        }

        button.disabled = false;
        button.innerHTML = 'Add Task';
    }

    async function checkStatus(jobId, queueId, intervalId) {
        if(!anotherStatusRequestPending) {
            anotherStatusRequestPending = true;
            const response = await fetch("http://127.0.0.1:3000/status", {
                method: "POST",
                body: JSON.stringify({ jobId, queueId }),
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
            });

            if(!response.ok) {

                alert("Check Status Failed")
                clearInterval(intervalId);
            }
            
            else {
                const data = await response.json()
                jobs = jobs.map(job => job.jobId === jobId ? { ...job, status: data.status, logs: data.logs, outputs: data.outputs} : job);

                if (data.status === 'SUCCEEDED' || data.status === 'FAILED' || data.status === 'CANCELED') {
                    clearInterval(intervalId);
                }
            }

            anotherStatusRequestPending = false;
        }
    }

}

function validateFiles(event) {
    const name = document.getElementById("taskName").value;
    if (name === null || name.length === 0) {
        alert("Task job is required");
        event.preventDefault();
        return false;
    }

    const files = document.getElementById("fileUpload").files;
    let hasJson = false;
    let hasUsd = false;

    if (files.length !== 2) {
        alert("Please select exactly two files: one .json and one .usd");
        event.preventDefault();
        return false;
    }

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name.endsWith(".json")) {
            hasJson = true;
        } else if (file.name.endsWith(".usd")) {
            hasUsd = true;
        }
    }

    if (!hasJson || !hasUsd) {
        alert("Please select one .json file and one .usd file.");
        event.preventDefault();
        return false;
    }

    return true;
}

async function authenticateUser() {
    if (clientID === "" || clientSecret === "") {
        alert("Client ID and Secret is required");
        return;
    }

    try {
        console.log("Sending request ...")
        const response = await fetch("http://127.0.0.1:3000/login", {
            method: "POST",
            body: JSON.stringify({ clientID, clientSecret }),
            headers: {
                "Content-Type": "application/json",
            },
        });

        if(!response?.ok) {
            console.log("Error: ", response)
        } else {
            const data = await response.json()
            console.log(data)
            isAuthenticated = true;
            token = data.token;
        }
    } catch(err) {
        console.log("Error: ", err)
    }
}