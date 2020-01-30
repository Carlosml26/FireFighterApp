#Multiplatform Application for Emergency Service Communication 

Multiplatform application that help emergency human teams to improve their communication, with a text/voice chat and the map where appear where are all the teams and the specific place of the incident.
Moreover, the multiplatform application has a client side that manage every team and incident, relating to each incident their different teams that are going to take part in this incident.
In this way, the response toward emergency situations are going to be accelerated, since an administrator will create quickly the incident with their related teams; these teams can see where the incident exactly is and communicates with the other teams and the administrator in an easy way.


For this project implement the following technologies:

MongoDB: the document store database that is going to keep the important information of the app.

Loopback (Nodejs): this framework works over Nodejs and generate in a easy way the connection with the database (MongoDB) and the client (Angularjs).

Angularjs

WebRTC: framework used in the signal server to create individual channels between the different clients to transmit directly voice messages without using going throught the server.


##Download and install Nodejs and Mongodb:

Nodejs >= 8.4.0

Mongodb >= 3.6.1

##Preparing the enviroment

First, you must execute the mongodb "mongo.exe" to run the db (located where you installed mongodb, “..\Server\3.2\bin")

Install npm
``` npm install npm@latest –g ```

Install loopback
``` npm install -g loopback-cli  ```

Install driver loopback with mongodb
``` npm install --save loopback-connector-mongodb ```

Create driver and create model
``` lb datasource mongoDS --connector mongoDB
lb model 
```

Install bower
``` npm install –g bower ```

Install necessary packages
``` bower install angular-route
bower install angular-resource
bower install angular-cookies
bower install angular-material 
```

if lb-ng fail execute
``` npm unistall –g strongloop
nom cache clear
npm install –g strongloop
```

if url fails
```npm install –g generator-loopback```


##Initialization
In this project, mongodb is going to be running in the backgroud.

Moreover, we are going to have 2 servers, the first one is the main server which is going to have the conection with the database and is going to implement the loopback framework that connect the client with the server.

The second server is the signal server, that is going to connect two client device in order to share information directly using WebRTC.


