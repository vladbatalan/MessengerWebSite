function chatOnloadFunction(){
    var element = document.getElementById("message-container");
    element.scrollTop = element.scrollHeight;

    // Get the input field
    var input = document.getElementById("txtMessage");

    // Execute a function when the user releases a key on the keyboard
    input.addEventListener("keyup", function(event) {
    // Number 13 is the "Enter" key on the keyboard
    if (event.keyCode === 13) {
        // Cancel the default action, if needed
        event.preventDefault();
        // Trigger the button element with a click
        document.getElementById("btnSend").click();
    }
    });

    // keep alive to send from user periodically
    var crrUserId = document.getElementById("crr-user-id").value;

    // apply keep alive
    keepAlive(crrUserId);

    // call keep alive la fiecare minut
    setInterval(keepAlive, 1000 * 60);

    // facem reload la mesaje la fiecare 10 secunde
    setInterval(refreshPage, 1000 * 10);
}

function refreshPage(){
    // get the current user id and the other id
    let user_id = document.getElementById("crr-user-id");
    let other_id = document.getElementById("other-id");

    // if elements are found
    if(user_id && other_id){
        user_id = user_id.value;
        other_id = other_id.value;
        reloadMessages(user_id, other_id);

        // reload left page
    }
}

function keepAlive(user_id){
    if(user_id != -1){
        var xmlhttp = new XMLHttpRequest();
        xmlhttp.open("PUT", "/keep-alive");
        xmlhttp.setRequestHeader("Content-Type", "application/json");
        xmlhttp.send(JSON.stringify({"user_id": user_id}));
    }
}


function reloadMessages(sender, receiver){
    // preiau containerul care trebuie dat refresh
    var messageContainer = document.getElementById("message-container");

    // voi extrage cate mesaje contine containerul
    var nr_mesaje = messageContainer.children.length;

    // sent the message to oracle database
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {

            // pentru fiecare mesaj trimis inapoi
            var rezultat = JSON.parse(this.response);
            
            // daca este necesar sa facem update
            if(rezultat.length > nr_mesaje){

                let content = "";
                // pt fiecare mesaj din raspuns
                for(let index = 0; index < rezultat.length; index ++){
                    let msg = rezultat[index];

                    // console.log(msg);

                    // div content of message
                    content += "<div class='";

                    if(msg.id_sender == sender){
                        content += "user-message'>";
                    }
                    else{
                        content += "other-message'>";
                    }

                    // the mesage
                    content += "<p> " + msg.message_content + " </p>"
                    content += "<span class='message-date'> " + msg.timestamp + "</span>";
                    
                    // close div content of message
                    content += "</div>";
                }

                messageContainer.innerHTML = content;
                messageContainer.scrollTop = messageContainer.scrollHeight;
            }
        }
    };
    xmlhttp.open("GET", "/select-messages?sender=" + sender +"&receiver=" + receiver);
    xmlhttp.setRequestHeader("Content-Type", "application/json");
    xmlhttp.send();
}


function sendMessage(sender, receiver){
    var txtMessage = document.getElementById("txtMessage");
    var message = txtMessage.value;
    txtMessage.value = "";

    // sent the message to oracle database
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
            reloadMessages(sender, receiver);
        }
    };
    xmlhttp.open("POST", "/insert-message");
    xmlhttp.setRequestHeader("Content-Type", "application/json");
    xmlhttp.send(JSON.stringify({content: message, sender: sender, receiver: receiver}));

    // alert("(" + sender + ", " + receiver + ") => " + message);
}