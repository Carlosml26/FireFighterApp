
//our username 
var myName;
var connectedUser;
var blob;
var archivo;
var url;
var numMensajes;
var fileReader = new FileReader;


//connecting to our signaling server 
var conn = new WebSocket('ws://localhost:9090');

conn.onopen = function () {
    numMensajes = 0; // contador de los mensajes, necesario para referenciar los audios
    console.log("Connected to the signaling server");
};


//when we got a message from a signaling server 
conn.onmessage = function (msg) {
    var data = JSON.parse(msg.data);
    console.log("Got message", msg.data); 

    switch (data.type) {
        case "login":
            handleLogin(data.success, data.mapKeys, data.mapValues);
            break;
            //when somebody wants to call us 
        case "offer":
            handleOffer(data.offer, data.name);
            break;
        case "answer":
            handleAnswer(data.answer, data.name);
            break;
            //when a remote peer sends an ice candidate to us 
        case "candidate":
            handleCandidate(data.candidate, data.name);
            break;
        case "leave":
            handleLeave(data.origen);
            break;
        case "update":
            handleUpdate(data.origen, data.coordenadas);
            break;
        default:
            break;
    }
};

conn.onerror = function (err) {
    console.log("Got error", err);
};


//alias for sending JSON encoded messages 
function send(message) {

    //attach the other peer username to our messages
    if (connectedUser) {
        message.name = connectedUser;
    }

    conn.send(JSON.stringify(message));
}
;

//****** 
//UI selectors block 
//****** 

var chats = new Map();
//var chatGrupo = document.querySelector('#chatgrupo');
var loginPage = document.querySelector('#loginPage');
var usernameInput = document.querySelector('#usernameInput');
var userpasswordInput = document.querySelector('#userpasswordInput');
var loginBtn = document.querySelector('#loginBtn');
var contadorAnswers = 0;
var users = [];

var mainPage = document.querySelector('#mainPage');
var callToUsernameInput = document.querySelector('#callToUsernameInput');
var callBtn = document.querySelector('#callBtn');


var chatsPanelMap = new Map();
//var chatGroupPanel = document.querySelector('#chatgrupoPanel');
var grupoBotonesChat = document.querySelector('#grupoBotonesChat');
var grupoBotonesAccesoChat = document.querySelector('#grupoBotonesAccesoChat');
//var botonGrupo = document.querySelector('#botonGrupo');
var chatsPanel = document.querySelector('#chatsPanel');
var botonesChatMap = new Map();
var chatActual;

var mensaje = document.querySelector('#Mensaje');
var botonEnviar = document.querySelector('#botonEnviar');

var pos = 0;
var usersMap = new Map();
var connectionMap = new Map();
var dataChannelMap = new Map();

var dc;

 
// Login when the user clicks the button 
function loginUser () {
    send({
        type: "login",
        origen: myName
    });
};
    
function finalizarIncidencia (titulo){
    send({
        type: "deleteIncidencia",
        origen: myName,
        titulo: titulo
    });

    markerMap.get(titulo).setMap(null);
    markerMap.delete(titulo);

    $('#btn-groupgrupo-'+ titulo).remove();  
    $('#chatgrupo-'+ titulo + "Panel").remove();   
}



function crearIncidencia ( incidencia, participantes ){    
    send({
        type: "createIncidencia",
        origen: myName,
        titulo: incidencia.titulo,
        coordenadas: [incidencia.latitud,incidencia.longitud],
        participantes: participantes
    });

    crearChat( 'grupo-'+ incidencia.titulo);

};




function handleLogin(success, keys, values) {


    if (success === false) {
        alert("Ooops...try a different username");
    } else {

  //      chatGroupPanel.style.display = "block";
       
        
        // conseguir todas las posiciones para el mapa
        for (i = 0; i < keys.length; i++) {
            cargarCoordenadas(keys[i], (values[i])[0], (values[i][1]));
        }

        connectionMap = new Map();
        dataChannelMap = new Map();

    }
}
;



//when somebody sends us an offer 
function handleOffer(offer, name) {

    users[contadorAnswers] = name;

    //using Google public stun server 
    var configuration = {
        "iceServers": [{"url": "stun:stun2.1.google.com:19302"}]
    };

    yourConn = new RTCPeerConnection(configuration);
    // Setup ice handling 
    yourConn.connectedUser = name;

    yourConn.onicecandidate = function (event) {
        if (event.candidate) {
            send({
                type: "candidate",
                candidate: event.candidate,
                name: this.connectedUser                
            });
        }
    };


    yourConn.ondatachannel = function (event) {
        var receiveChannel = event.channel;
        var blob = false;
        var origen = "";
        var chat = "";
        var nombre = name;
        receiveChannel.onmessage = function (event) { //recibe evento         
            if (blob) {
                var blobRecibido = new Blob([event.data], {type: 'audio/wav'});
                makeUrlBlob(blobRecibido);
                nuevaEntradaPlantilla2(origen, chat);
                blob = false;
                chat = "";
            } else{
                var info = JSON.parse(event.data);
                $('#buttonChat' + (info.chat).substring(5)).attr('class','btn btn-warning');

                $('#buttonAccessChat' + (info.incidencia)).attr('class','btn btn-warning ng-binding');
                chat = info.chat;
                if (info.blob) {
                    blob = true; 
                    origen = info.origen;
                } else {
                    nuevaEntradaPlantilla(info.origen, info.mensaje, info.chat);
                }
            }
            nombre = connectedUser;
        };
    };

    //creating data channel 
    dataChannel = (yourConn.createDataChannel(name, {reliable: true}));
    dataChannel.binaryType = "blob";


    dataChannel.onerror = function (error) {
        console.log("Ooops...error:", error);
    };


    /*      	
     //when we receive a message from the other peer, display it on the screen   
     dataChannel.onmessage = function (event) { 
     }; 
     */
    dataChannel.onclose = function () {

        console.log("data channel is closed");
    };


    

    yourConn.setRemoteDescription(new RTCSessionDescription(offer));

    //create an answer to an offer 
    yourConn.createAnswer(function (answer) {
        connectionMap.get(users[contadorAnswers]).setLocalDescription(answer);
        send({
            type: "answer",
            answer: answer,
            name: users[contadorAnswers]
        });
        contadorAnswers++;
    }, function (error) {
        alert("Error when creating an answer");
    });

    connectionMap.set(name, yourConn);

    dataChannelMap.set(name, dataChannel);

    crearChat( name );
};
//por si se quiere un chat de grupo con todos los equipos
/*
botonGrupo.addEventListener("click", function (event) {
    chatGroupPanel.style.display = "block";

    chatsPanelMap.forEach(function (item, key, mapObj) {
        document.querySelector('#chat' + key + "Panel").style.display = "none";
    });

    chatActual = '#chatgrupo';
});
*/

function cambiarChat(name) {
//   chatGroupPanel.style.display = "none";
    $('#buttonChat' + name).attr('class','btn btn-primary');


    chatsPanelMap.forEach(function (item, key, mapObj) {
        if (key === name) {  
            $('#chat' + key + "Panel").attr('class','panel-body visible-print-none');
        } else {
            $('#chat' + key + "Panel").attr('class','panel-body visible-print-block');
        }
    });
    chatActual = '#chat' + name;
}
;

//when we got an answer from a remote user 
function handleAnswer(answer, name) {
    connectionMap.get(name).setRemoteDescription(new RTCSessionDescription(answer));
}
;

//when we got an ice candidate from a remote user 
function handleCandidate(candidate, name) {
    connectionMap.get(name).addIceCandidate(new RTCIceCandidate(candidate));
}
;

//hang up 
function hangUp () {
    if (connectionMap !== null){
        send({
            type: "leave",
            origen: myName
        });
        handleLeave("all");        
    }
};

function handleLeave(name) {

    if (name !== "all" && name !== "admin"){
       connectionMap.get(name).close();
       connectionMap.get(name).onicecandidate = null;
       connectionMap.delete(name);
        dataChannelMap.delete(name);
        $('#btn-group'+ name).remove();  
        $('#chat'+ name + "Panel").remove();        
        
        markerMap.get(name).setMap(null);
        markerMap.delete(name);
    }else{
        connectionMap.forEach(function (item, key, mapObj){
            item.close;
            item.onicecandidate = null;
        });
        connectionMap = null;
        dataChannelMap = null;
    }
};

function handleUpdate(user, coordenadas) {
    cargarCoordenadas(user, coordenadas[0], coordenadas[1]);
};



//when user clicks the "send message" button 
function enviarAudio () {

    nuevaEntradaPlantilla2(myName, chatActual);
    
    if (chatActual === "#chatgrupo-" + incidenciaActual.titulo) {
        let info = {
            "blob": true,
            "chat": chatActual,
            "origen": "admin"
        };
        dataChannelMap.forEach(function (item, key, mapObj) {
           if(incidenciaActual.participantes.includes(key)){
                item.send(JSON.stringify(info));
                item.send(archivo);
           }
        });
    } else {
        let info = {
            "blob": true,
            "chat": '#chatadmin',
            "origen": "admin"
        };
        dataChannelMap.get(chatActual.substring(5)).send(JSON.stringify(info));
        dataChannelMap.get(chatActual.substring(5)).send(archivo);
    }

};



botonEnviar.addEventListener("click", function (event) {
    var val = mensaje.value;
    nuevaEntradaPlantilla(myName, val, chatActual);

    //sending a message to a connected peer 
    if (chatActual === '#chatgrupo-' + incidenciaActual.titulo) {
        let info = {
            "blob": false,
            "chat": chatActual,
            "origen": "admin",
            "mensaje": val
        };
        dataChannelMap.forEach(function (item, key, mapObj) {
            if(incidenciaActual.participantes.includes(key)){
                item.send(JSON.stringify(info));
            }
        });
    } else {
        let info = {
            "blob": false,
            "chat": '#chatadmin',
            "origen": "admin",
            "mensaje": val
        };
        dataChannelMap.get(chatActual.substring(5)).send(JSON.stringify(info));
    }
    mensaje.value = "";
});

//cada vez que envio un mensaje o recibo aparece en el chat
function nuevaEntradaPlantilla(quien, mensaje, chat) {
    $("#plantilla").clone().appendTo(chat);
    $(chat + ' #plantilla').show(10);
    $(chat + ' #plantilla .Nombre').html(quien);
    $(chat + ' #plantilla .Mensaje').html(mensaje);

    var formattedDate = new Date();
    var d = formattedDate.getUTCDate();
    var m = formattedDate.getMonth();
    var y = formattedDate.getFullYear();
    var h = formattedDate.getHours();
    var min = formattedDate.getMinutes();
    Fecha = d + "/" + m + "/" + y + " " + h + ":" + min;
    $(chat + ' #plantilla .Tiempo').html(Fecha);
    $(chat + ' #plantilla').attr("id", "");
    $('#chatsPanel').scrollTop($('#chatsPanel')[0].scrollHeight);
    
}

function nuevaEntradaPlantilla2(quien, chat) {
    numMensajes++;
    //sending a message to a connected peer
    var plantilla2 = $("#plantilla2").clone();
    plantilla2.attr("id", "plantilla2-" + numMensajes);
    plantilla2.appendTo(chat);

    $(chat + ' #plantilla2-' + numMensajes).show(10);
    $(chat + ' #plantilla2-' + numMensajes + ' .Nombre').html(quien);
    $(chat + ' #plantilla2-' + numMensajes + ' .Audio').attr("src", url);
    $(chat + ' #plantilla2-' + numMensajes + ' .Audio').attr("id", "audio" + numMensajes);
    $(chat + ' #plantilla2-' + numMensajes + ' #botonAudio').attr("onclick", "document.getElementById('audio" + numMensajes + "').play()");
    $(chat + ' #plantilla2-' + numMensajes + ' #mensajeAudio').attr("onclick", "document.getElementById('audio" + numMensajes + "').play()");
    
    

    var formattedDate = new Date();
    var d = formattedDate.getUTCDate();
    var m = formattedDate.getMonth();
    var y = formattedDate.getFullYear();
    var h = formattedDate.getHours();
    var min = formattedDate.getMinutes();
    Fecha = d + "/" + m + "/" + y + " " + h + ":" + min;
    $(chat + ' #plantilla2 .Tiempo').html(Fecha);
    $(chat + ' #plantilla2').attr("id", "");

    $('#chatsPanel').scrollTop($('#chatsPanel')[0].scrollHeight);
    
}


function crearChat ( name ){

    console.log("creando chat");

    var newDivChatPanel = document.createElement("div");
    newDivChatPanel.id = "chat" + name + "Panel";
    newDivChatPanel.className = "panel-body visible-print-none"
    var newUlChat = document.createElement("div");
    newUlChat.id = "chat" + name;
    newUlChat.className = "chat";

    newDivChatPanel.appendChild(newUlChat);

    chatsPanel.appendChild(newDivChatPanel);

    chatsPanelMap.set(name, newDivChatPanel);

    var newDivButton = document.createElement("div");
    newDivButton.className = "btn-group visible-print-block";
    newDivButton.id = "btn-group" + name;
    var newButton = document.createElement("button");
    newButton.type = "button";
    newButton.id = "buttonChat" + name;
    newButton.className = "btn btn-primary";
    newButton.innerHTML = name;
    newButton.setAttribute("onclick", "cambiarChat( '" + name + "' )");

    newDivButton.appendChild(newButton);
    grupoBotonesChat.appendChild(newDivButton);
}

function crearAccesoChat (name){
    var newButton = document.createElement("button");
    newButton.type = "button";
    newButton.id = "buttonAccesChat" + name;
    newButton.className = "btn btn-default";
    newButton.innerHTML = name;
    newButton.setAttribute("onclick", "cambiarChat( '" + name + "' )");

    grupoBotonesAccesoChat.appendChild(newButton);
}