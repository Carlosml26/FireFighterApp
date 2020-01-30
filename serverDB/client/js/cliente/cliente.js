//our username 
var myName = '';
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
    switch (data.type) {
        case "login":
            handleLogin(data.success, data.mapKeys, data.mapValues, data.users, data.admin, data.titulo);
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
        case "createIncidencia":
            handleCreateIncidencia(data.coordenadas, data.users, data.titulo, data.usersConectados);
        break;
        case "deleteIncidencia":
             handleDeleteIncidencia();
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
    conn.send(JSON.stringify(message));
};

//****** 
//UI selectors block 
//****** 

var loginPage = document.querySelector('#loginPage');
var usernameInput = document.querySelector('#usernameInput');
var loginBtn = document.querySelector('#loginBtn');
var users = [];
var contadorOfertas = 0;
var contadorAnswers = 0;

var mainPage = document.querySelector('#mainPage');
var callToUsernameInput = document.querySelector('#callToUsernameInput');

var hangUpBtn = document.querySelector('#hangUpBtn');
var sendAudioBtn = document.querySelector('#sendAudioBtn');


var mensaje = document.querySelector('#Mensaje');
var botonEnviar = document.querySelector('#botonEnviar');

var chatAdminPanel = document.querySelector('#chatadminPanel');
//var chatGrupoPanel = document.querySelector('#chatgrupoPanel');
var chatsPanel = document.querySelector('#chatsPanel');

var botonAdmin = document.querySelector('#botonAdmin');
//var botonGrupo = document.querySelector('#botonGrupo');
//var botonGrupoWrapper = document.querySelector("#btn-groupgrupo")
var grupoBotonesChat = document.querySelector('#grupoBotonesChat');

var chatActual = '#chatadmin';
var chatsPanelMap = new Map();

var yourConn;
var dataChannel;
var dc;
var connectionMap = new Map();
var dataChannelMap = new Map();
var administrador;
var tituloIncidencia;

function loginUser () {  
    if (myName.length > 0 && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(loginCoords);
    }
   
};

//necesitamos saber las coordenadas del usuario
function loginCoords(position) {
    send({
        type: "loginEquipo",
        origen: myName,
        lat: position.coords.latitude,
        lng: position.coords.longitude
    });
};


function onError(error) {
    alert('code: '    + error.code    + '\n' +
          'message: ' + error.message + '\n');
}


function handleLogin(success, keys, values, usersName, admin, titulo) {
    if (success === false) {
        alert("Ooops...try a different username");
    } else {
        loginPage.style.display = "none";
        mainPage.style.display = "block";
        chatAdminPanel.style.display = "block";
        
        initMap();     

        var options = { timeout: 30000 };
        watchID = navigator.geolocation.watchPosition(coords, onError, options);     
        
        if (titulo != null ){
            //cambiar mapa
            tituloIncidencia = "grupo-" + titulo;        
            crearChat(tituloIncidencia);                
        }else{
           
        }
        
        // cargar las cordenadas de todos en el mapa
        for (i = 0; i < keys.length; i++){
            cargarCoordenadasEquipo(keys[i], (values[i])[0], (values[i][1]));            
        }

        administrador = admin;
        usersName.unshift(admin);
        keys.unshift(admin);
        //********************** 
        //Starting a peer connection 
        //********************** 

        //using Google public stun server 
        var configuration = {
            "iceServers": [{"url": "stun:stun2.1.google.com:19302"}]
        };

        var posicionUser = 0;

        for (i = 0; i < usersName.length; i++) {
            
            // conseguir todas las posiciones para el mapa
            if (usersName[i] !== myName && keys.includes(usersName[i])){ 
              
                users[posicionUser] = usersName[i];
                posicionUser++;
                yourConn = new RTCPeerConnection(configuration);
                // Setup ice handling 
                yourConn.connectedUser = usersName[i];
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
                    receiveChannel.onmessage = function (event) { //recibe evento 
                                  
                        if (blob) {
                            var blobRecibido = new Blob([event.data], {type: 'audio/wav'});
                            makeUrlBlob(blobRecibido);
                            nuevaEntradaPlantilla2(origen, chat);
                            blob = false;
                            chat = "";
                        } else{
                            var info = JSON.parse(event.data);
                            chat = info.chat;

                            $('#buttonChat' + (info.chat).substring(5)).attr('class','btn btn-warning');
                            if (info.blob) {
                                blob = true; 
                                origen = info.origen;
                            } else {
                                nuevaEntradaPlantilla(info.origen, info.mensaje, info.chat);
                            }
                        }
                    };
                };
        
        
                //creating data channel 
                dataChannel = yourConn.createDataChannel("channel1", {reliable: true});
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

                    
                connectionMap.set(usersName[i], yourConn);
                dataChannelMap.set(usersName[i], dataChannel);
                
                yourConn.createOffer(function (offer) {
                    send({
                        type: "offer",
                        offer: offer,
                        name: users[contadorOfertas]
                    });
                    connectionMap.get(users[contadorOfertas]).setLocalDescription(offer);
                    contadorOfertas++;
                }, function (error) {
                    alert("Error when creating an offer");
                });

                if (usersName[i] !== admin){
                    crearChat(usersName[i]);
                }
            }
        }
    }     
};


//when somebody sends us an offer 
function handleOffer(offer, name) {
    //********************** 
        //Starting a peer connection 
        //********************** 

        //using Google public stun server 
        var configuration = {
            "iceServers": [{"url": "stun:stun2.1.google.com:19302"}]
        };

    users[contadorOfertas] = name;

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

                chat = info.chat;
                if (info.blob) {
                    blob = true; 
                    origen = info.origen;
                } else {
                    nuevaEntradaPlantilla(info.origen, info.mensaje, info.chat);
                }
            }
        };
    };


    //creating data channel 
    dataChannel = yourConn.createDataChannel("channel1", {reliable: true});
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
            connectionMap.get(users[contadorOfertas]).setLocalDescription(answer);
            send({
                type: "answer",
                answer: answer,
                name: users[contadorOfertas]
            });
            contadorOfertas++;
        }, function (error) {
            alert("Error when creating an answer");
        });


        connectionMap.set(name, yourConn);
        dataChannelMap.set(name, dataChannel);

    if (name !== "admin"){
        crearChat(name);
    }
};

//when we got an answer from a remote user 
function handleAnswer(answer, name) {
    connectionMap.get(name).setRemoteDescription(new RTCSessionDescription(answer));
};

//when we got an ice candidate from a remote user 
function handleCandidate(candidate, name) {   
    connectionMap.get(name).addIceCandidate(new RTCIceCandidate(candidate));
};

/*
hangUpBtn.addEventListener("click", function () {
    if (connectionMap !== null){
        send({
            type: "leave",
            origen: myName
        });
        handleLeave("all");
    }
});
*/

function handleLeave(name) {    
    if (name !== "all" && name !== myName){
        connectionMap.get(name).close();
        connectionMap.get(name).onicecandidate = null;
        connectionMap.delete(name);
        dataChannelMap.delete(name);
        $('#btn-group'+ name).remove();        
        $('#chat'+ name + "Panel").remove();             
    }else{
        connectionMap.forEach(function (item, key, mapObj){
            item.close;
            item.onicecandidate = null;
        });
        connectionMap = null;
        dataChannelMap = null;
        
    }
}
;

function handleUpdate(user, coordenadas) {
    console.log("actualizando coordenadas de " + user);
    cargarCoordenadasEquipo(user, coordenadas[0], coordenadas[1]);
};

function handleDeleteIncidencia(){
    console.log("Saliendo de la incidencia");
    for (var i = 0; i < users.length;i++){ 
        if (users[i] !== administrador){
            handleLeave(users[i]);            
        }    
    }

    $('#btn-group'+ tituloIncidencia).remove();        
    $('#chat'+ tituloIncidencia + "Panel").remove(); 
    eliminarMarker(tituloIncidencia); 
    
};

function handleCreateIncidencia(coordenadas, usersName, titulo, keys) {
    console.log("Accediendo a una incidencia");
    tituloIncidencia = "grupo-" + titulo;

    crearChat(tituloIncidencia);
   //     botonGrupoWrapper.style.display ="block";
    //    chatGrupoPanel.style.display = "block";            

        //********************** 
        //Starting a peer connection 
        //********************** 

        //using Google public stun server 
        var configuration = {
            "iceServers": [{"url": "stun:stun2.1.google.com:19302"}]
        };


        for (i = 0; i < usersName.length; i++) {
            // conseguir todas las posiciones para el mapa
            
            if (usersName[i] !== myName && keys.includes(usersName[i])){
                users[i+1] = usersName[i];
                yourConn = new RTCPeerConnection(configuration);
                // Setup ice handling 
                yourConn.connectedUser = usersName[i];
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
                            chat = info.chat;
                            if (info.blob) {
                                blob = true; 
                                origen = info.origen;
                            } else {
                                nuevaEntradaPlantilla(info.origen, info.mensaje, info.chat);
                            }
                        }
                    };
                };
        
        
                //creating data channel 
                dataChannel = yourConn.createDataChannel("channel1", {reliable: true});
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

                    
                connectionMap.set(usersName[i], yourConn);
                dataChannelMap.set(usersName[i], dataChannel);
                
                yourConn.createOffer(function (offer) {
                    send({
                        type: "offer",
                        offer: offer,
                        name: users[contadorOfertas]
                    });
                    connectionMap.get(users[contadorOfertas]).setLocalDescription(offer);
                    contadorOfertas++;
                }, function (error) {
                    alert("Error when creating an offer");
                });

                if (usersName[i] !== administrador){
                    crearChat(usersName[i]);
                }
            }
        }
    cargarCoordenadasIncidencia( tituloIncidencia ,coordenadas[0], coordenadas[1]);
    newLocation(coordenadas[0], coordenadas[1]);
    map.setZoom (16);

    }
    
//  por si queremos un chat de grupo con todos los participantes
/*
botonGrupo.addEventListener("click", function (event) {
    chatGrupoPanel.style.display = "block";
    chatAdminPanel.style.display = "none";    
    
    chatsPanelMap.forEach(function (item, key, mapObj) {
        document.querySelector('#chat' + key + "Panel").style.display = "none";
    });
    
    chatActual = '#chatgrupo';
});
*/
botonAdmin.addEventListener("click", function (event) {
  //  chatGrupoPanel.style.display = "none";
    chatAdminPanel.style.display = "block";    
   
    chatsPanelMap.forEach(function (item, key, mapObj) {
        document.querySelector('#chat' + key + "Panel").style.display = "none";
    });

    chatActual = '#chatadmin';
});


function cambiarChat(name) {
  //  chatGrupoPanel.style.display = "none";
    $('#buttonChat' + name).attr('class','btn btn-primary');
  
    chatAdminPanel.style.display = "none";
    
    chatsPanelMap.forEach(function (item, key, mapObj) {
        if (key === name) {
            document.querySelector('#chat' + key + "Panel").style.display = "block";
        } else {
            document.querySelector('#chat' + key + "Panel").style.display = "none";
        }
    });
    chatActual = '#chat' + name;
};



function enviarAudio () {
    nuevaEntradaPlantilla2(myName, chatActual);
    
    if (chatActual === '#chat'+ tituloIncidencia) {
        let info = {
            "blob": true,
            "chat": chatActual,
            "incidencia": tituloIncidencia,
            "origen": myName
        };
        dataChannelMap.forEach(function (item, key, mapObj) {
            item.send(JSON.stringify(info));
        });
        dataChannelMap.forEach(function (item, key, mapObj) {
            item.send(archivo);
        });

    } else {
        let info = {
            "blob": true,
            "chat": '#chat' + myName,
            "incidencia": tituloIncidencia,
            "origen": myName
        };
        dataChannelMap.get(chatActual.substring(5)).send(JSON.stringify(info));
        dataChannelMap.get(chatActual.substring(5)).send(archivo);
        
    }
};


botonEnviar.addEventListener("click", function (event) {
    var val = mensaje.value;
    nuevaEntradaPlantilla(myName, val, chatActual);
    //sending a message to a connected peer 
    if (chatActual === '#chat'+ tituloIncidencia) {
         let info = {
            "blob": false,
            "chat": chatActual,
            "origen": myName,
            "incidencia": tituloIncidencia,
            "mensaje": val
        };
        dataChannelMap.forEach(function (item, key, mapObj) {
            item.send(JSON.stringify(info));
        });
    }else{
        let info = {
            "blob": false,
            "chat": '#chat' + myName,
            "origen": myName,
            "incidencia": tituloIncidencia.substring(5),
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
    
        console.log("creando chat: " + name );
        var newDivChatPanel = document.createElement("div");
        newDivChatPanel.id = "chat" + name + "Panel";
        newDivChatPanel.className = "panel-body";
        newDivChatPanel.style.display = "none";
        var newUlChat = document.createElement("div");
        newUlChat.id = "chat" + name;
        newUlChat.className = "chat";
    
        newDivChatPanel.appendChild(newUlChat);
    
        chatsPanel.appendChild(newDivChatPanel);
    
        chatsPanelMap.set(name, newDivChatPanel);
    
        var newDivButton = document.createElement("div");
        newDivButton.className = "btn-group";
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