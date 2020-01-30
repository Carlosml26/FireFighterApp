//require our websocket library 
var WebSocketServer = require('ws').Server;
 
//creating a websocket server at port 9090 
var wss = new WebSocketServer({port: 9090}); 

//all connected to the server users 
var users = {};
var usersIncidencia = {};
var admin;

//cada user tiene unas coordenadas
var usersMap = new Map();
var incidenciasMap = new Map();

//when a user connects to our sever 
wss.on('connection', function(connection) {
  
   console.log("User connected");
	 
   //when server gets a message from a connected user 
   connection.on('message', function(message) {
	 
      var data; 
      //accepting only JSON messages 
      try { 
         data = JSON.parse(message); 
      } catch (e) { 
         console.log("Invalid JSON"); 
         data = {}; 
      }
		  
      //switching type of the user message 
      switch (data.type) { 
         //when a user tries to login 
         case "login": 
            console.log("User logged", data.origen); 
            //if anyone is logged in with this username then refuse 
            if(users[data.origen]) { 
               sendTo(connection, { 
                  type: "login", 
                  success: false 
               }); 
            } else { 
               //save user connection on the server 
               users[data.origen] = connection; 
               connection.name = data.origen; 
				admin = data.origen;
				
				let keys = Array.from( usersMap.keys() );
				let values = Array.from( usersMap.values() );

				sendTo(connection, { 
                  type: "login", 
                  success: true,
				  mapKeys: keys,
				  mapValues: values
				});
            }
				
            break;
			case "loginEquipo": 
            console.log("User logged", data.origen); 
            //if anyone is logged in with this username then refuse 
            if(users[data.origen]) { 
               sendTo(connection, { 
                  type: "login", 
                  success: false 
               }); 
            } else { 
               //save user connection on the server 
               users[data.origen] = connection; 
               connection.name = data.origen; 
				
				usersMap.set(data.origen, [data.lat, data.lng]);

				let keys = Array.from( usersMap.keys() );
				let values = Array.from( usersMap.values() );
	
				titulo = usersIncidencia[data.origen];
				if (titulo != null){
					usersName = incidenciasMap.get(titulo)[0];
				}else{
					usersName = [];
				}

				sendTo(connection, { 
                  type: "login", 
                  success: true,
				  mapKeys: keys,
				  mapValues: values,
				  users: usersName,
				  admin: admin,
				  titulo: titulo
				});
				
				
				for (var key in users){	
					if (key !== data.origen){
						conn = users[key];
						sendTo(conn, {
							type: "update",
							origen: data.origen,
							coordenadas: [data.lat, data.lng]
							
						});
					}	
				}
				
            }
				
            break;
		 case "update":
		        console.log("Updating coord of:", data.origen); 
				usersMap.set(data.origen, [data.lat, data.lng]);

				for (var key in users){
					
					if (key !== data.origen){
						conn = users[key];
						sendTo(conn, {
							type: "update",
							origen: data.origen,
							coordenadas: [data.lat, data.lng]
							
						});
					}	
	
				}
			
		 
		 break;
		 case "createIncidencia":
		        console.log("Creando incidencia:", data.origen); 
				incidenciasMap.set(data.titulo, [data.participantes, data.coordenadas]);
				let keys = Array.from( usersMap.keys() );
				var participantes = Array.from(data.participantes);
				
				for (var i = 0; i < data.participantes.length; i++){

					participantes.shift();
					
					usersIncidencia[data.participantes[i]] = data.titulo;

					conn = users[data.participantes[i]];
					if (conn != null){
						sendTo(conn, {
							type: "createIncidencia",
							coordenadas: data.coordenadas,
							titulo: data.titulo,
							users: participantes,
							usersConectados: keys
						});
					}
				}
			
		 
		 break;
		 case "deleteIncidencia":
		        console.log("Eliminando incidencia:", data.titulo);
				console.log(incidenciasMap.get(data.titulo));
				var usuarios = incidenciasMap.get(data.titulo) [0];

				
				for (var i = 0; i < usuarios.length; i++){
					
					delete usersIncidencia[usuarios[i]];

					conn = users[usuarios[i]];
					if (conn != null){
						sendTo(conn, {
							type: "deleteIncidencia"
						});
					}
				}
			
		 
		 break;
         case "offer": 
            //for ex. UserA wants to call UserB 
            console.log("Sending offer to: ", data.name); 
				
            //if UserB exists then send him offer details 
            var conn = users[data.name]; 
				
            if(conn != null) { 
               //setting that UserA connected with UserB 
               connection.otherName = data.name; 
					
					
               sendTo(conn, { 
                  type: "offer", 
                  offer: data.offer, 
                  name: connection.name 
               }); 
            } 
				
            break;
				
         case "answer": 
            console.log("Sending answer to: ", data.name); 
            //for ex. UserB answers UserA 
            var conn = users[data.name]; 
				
            if(conn != null) { 
               connection.otherName = data.name; 
               sendTo(conn, { 
                  type: "answer", 
                  answer: data.answer,
				  name: connection.name
               }); 
            } 
				
            break;
				
         case "candidate": 
            console.log("Sending candidate to:",data.name);
            var conn = users[data.name];  
				
            if(conn != null) { 
               sendTo(conn, { 
                  type: "candidate", 
                  candidate: data.candidate,
				  name: connection.name
               }); 
            } 
				
            break;
				
         case "leave": 
            console.log("Disconnecting from", data.origen); 
            var conn;
			delete users[connection.name];
			usersMap.delete(connection.name);
			//notify the other users so he can disconnect his peer connection 
			for (var key in users){
				if (key !== data.origen){
					conn = users[key];
					conn.otherName = null;
					sendTo(conn, { 
					  type: "leave",
					  origen: data.origen
				   });
				}	
			}
	
            break;
			
         default: 
            sendTo(connection, { 
               type: "error", 
               message: "Command not found: " + data.type 
            }); 
				
            break;
				
      }  
   });
	
   //when user exits, for example closes a browser window 
   //this may help if we are still in "offer","answer" or "candidate" state 
   connection.on("close", function() { 
	
      if(connection.name) {	

			console.log("Disconnecting ", connection.name); 
			var conn;
			delete users[connection.name];
			usersMap.delete(connection.name);	

			for (var key in users){
				conn = users[key];
				sendTo(conn, { 
					type: "leave",
					origen: connection.name
				});
			}	
			connection = null;
      } 
   });
	
	
});
  
function sendTo(connection, message) { 
   connection.send(JSON.stringify(message)); 
}