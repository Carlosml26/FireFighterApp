var incidenciaActual;
var myApp = angular.module('myItems', ['lbServices','ngCookies']);
var newMarker;
var equiposSeleccionadosGlobal = [];
var equiposEnIncidencias = [];

myApp.directive("showPassword", function() { 
    return function linkFn(scope, elem, attrs) {
        scope.$watch(attrs.showPassword, function(newValue) {
            if (newValue) {
                elem.attr("type", "text");
            } else {
                elem.attr("type", "password");
            };
        });
    };
});

myApp.controller("myItemsController", function ($scope, $http,$cookies,$cookieStore,$location ,Admin, Equipo, Incidencia){
    $scope.userName = '';
    $scope.userPassword = '';
    var el = angular.element('#loginErrorAlert');
    el.attr('class', 'visible-print-block');


    $scope.login = function(){
        
        if ($scope.userName != '' && $scope.userPassword != ''){
            el.attr('class', 'visible-print-block');
            
            Admin.findOne({filter:{where: {name: $scope.userName }, limit: 1}}, function(data) {
                if( data.password == $scope.userPassword){
                    $cookies.put('name', data.name);  
                    myName = data.name; 
                    angular.element('#loginPage').attr('class','container text-center visible-print-block');;
                    angular.element('#mainPage').attr('class','call-page container visible-print-none');;
                    loginUser(); 
             
                }else{                    
                    el.attr('class', 'visible-print-none');
                }            
            });
        }else{            
            el.attr('class', 'visible-print-block');
        }
    };
});



myApp.controller("mainPageController", function ($scope, $http, Admin, Equipo, Incidencia){
    
   
    var listadoIncidenciasPage = angular.element('#listadoIncidenciasPage');
    var mapRow = angular.element('#mapRow');
    var incidenciasRow = angular.element('#incidenciasRow');
    var addIncidenciaRow = angular.element('#addIncidenciaRow');
    var chatRow = angular.element('#chatRow');
    var createEquipoRow = angular.element('#createEquipoRow');
    var createAdminRow = angular.element('#createAdminRow');
    var antiguasIncidenciasRow = angular.element('#antiguasIncidenciasRow');

    $scope.equiposSeleccionados;

    Incidencia.find({
        filter:{
            where:{
                activa: true
            }
        }
    },function (data){
        $scope.incidencias = data;
        initMap();
        angular.forEach($scope.incidencias, function (value){
            console.log(map);
            newMarker = new google.maps.Marker({
                position: new google.maps.LatLng(value.latitud,value.longitud),
                map: map,
                icon: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png'
            });
            newMarker.setTitle(value.titulo);
            
            google.maps.event.addListener(newMarker, 'click', (function (newMarker) {
                return function () {
                    $scope.cargarIncidencia( newMarker.getTitle() );
                }
            })(newMarker));

            
            markerMap.set(value.titulo,newMarker);

            crearChat( 'grupo-' + value.titulo);                            
        });
    });   

    $scope.borrarIncidencia = function(index){        
        angular.forEach($scope.incidencias[index].participantes, function(value) {
            if (markerMap.has(value)){
                markerMap.get(value).setLabel({
                    text: value,
                    color: 'black'
                });
            }
            equiposEnIncidencias.splice(equiposEnIncidencias.indexOf(value),1);
            Equipo.findOne({filter: {where: {nombre: value}, limit: 1 }},function (data){
                Equipo.prototype$patchAttributes({ id: data.id }, {incidenciaActual:'' });                
            });
        });
        
        Incidencia.prototype$patchAttributes({ id: $scope.incidencias[index].id }, {activa:false });

        finalizarIncidencia($scope.incidencias[index].titulo);
        
        $scope.incidencias[index].participantes = [];
    
        $scope.incidencias.splice(index,1);
    };
   

    $scope.abrirIncidencia = function( index ){    
        chatRow.attr('class','col-md-4 visible-print-none');
        incidenciasRow.attr('class','col-md-4 visible-print-block');
        addIncidenciaRow.attr('class','col-md-4 visible-print-block');
        antiguasIncidenciasRow.attr('class','col-md-4 visible-print-block');
        createEquipoRow.attr('class','col-md-4 visible-print-block');
        createAdminRow.attr('class','col-md-4 visible-print-block');
        
        angular.element('#buttonAccessChat-' +  $scope.incidencias[index].titulo).attr('class','btn btn-default ng-binding');

        incidenciaActual = $scope.incidencias[index];
        console.log(incidenciaActual);
        angular.forEach(users,function (value){
            if (incidenciaActual.participantes.includes(value)){
                angular.element('#btn-group' + value).attr('class','btn-group visible-print-none');                
            }else{
                angular.element('#btn-group' + value).attr('class','btn-group visible-print-block');                                
            }
        });

        angular.forEach($scope.incidencias, function (value){
            if (value.titulo != incidenciaActual.titulo){
                angular.element('#btn-groupgrupo-'+ value.titulo ).attr('class','btn-group visible-print-block');                
            }      
        });

        angular.element('#btn-groupgrupo-'+ incidenciaActual.titulo ).attr('class','btn-group visible-print-none');                
        chatActual = '#chatgrupo-' + incidenciaActual.titulo;  

        newLocation(incidenciaActual.latitud,incidenciaActual.longitud);
        map.setZoom(16);
    };

    $scope.cargarIncidencia = function( titulo ){    
        chatRow.attr('class','col-md-4 visible-print-none');
        incidenciasRow.attr('class','col-md-4 visible-print-block');
        addIncidenciaRow.attr('class','col-md-4 visible-print-block');
        antiguasIncidenciasRow.attr('class','col-md-4 visible-print-block');
        createEquipoRow.attr('class','col-md-4 visible-print-block');
        createAdminRow.attr('class','col-md-4 visible-print-block');

        angular.forEach($scope.incidencias , function (value){
            if (value.titulo == titulo){
                incidenciaActual = value;
            }      
        });

        console.log(incidenciaActual);
        angular.forEach(users,function (value){
            if (incidenciaActual.participantes.includes(value)){
                angular.element('#btn-group' + value).attr('class','btn-group visible-print-none');                
            }else{
                angular.element('#btn-group' + value).attr('class','btn-group visible-print-block');                                
            }
        });

        angular.forEach($scope.incidencias, function (value){
            if (value.titulo != incidenciaActual.titulo){
                angular.element('#btn-groupgrupo-'+ value.titulo ).attr('class','btn-group visible-print-block');                
            }      
        });

        angular.element('#btn-groupgrupo-'+ incidenciaActual.titulo ).attr('class','btn-group visible-print-none');                
        chatActual = '#chatgrupo-' + incidenciaActual.titulo;  

        newLocation(incidenciaActual.latitud,incidenciaActual.longitud);
        map.setZoom(16);
    };

    $scope.listarIncidencias = function(  ){

        chatRow.attr('class','col-md-4 visible-print-block');
        mapRow.attr('class','col-md-4 visible-print-none');
        incidenciasRow.attr('class','col-md-4 visible-print-none');
        addIncidenciaRow.attr('class','col-md-4 visible-print-block');
        antiguasIncidenciasRow.attr('class','col-md-4 visible-print-block');
        createEquipoRow.attr('class','col-md-4 visible-print-block');
        createAdminRow.attr('class','col-md-4 visible-print-block');

        if (newMarker != null){
            newMarker.setMap(null);            
        }


        creandoIncidencia = 0;
        

        angular.forEach(users, function(value) {
            angular.element('#btn-group' + value).attr('class','btn-group visible-print-block');                
        });


            
    };
    $scope.addIncidencia = function(  ){
        $scope.CurrentDate = new Date();
        $scope.equipos = Equipo.find({
            filter:{
                where:{
                    incidenciaActual: ""
                }
            }
        });

        
        chatRow.attr('class','col-md-4 visible-print-block');
        mapRow.attr('class','col-md-4 visible-print-none');
        incidenciasRow.attr('class','col-md-4 visible-print-block');
        addIncidenciaRow.attr('class','col-md-4 visible-print-none');
        antiguasIncidenciasRow.attr('class','col-md-4 visible-print-block');
        createEquipoRow.attr('class','col-md-4 visible-print-block');
        createAdminRow.attr('class','col-md-4 visible-print-block');

        newMarker = null;
        creandoIncidencia = 1;
        
        equiposSeleccionadosGlobal = [];
        moveToLocation(36.721274 , -4.421399);
    };
    

    $scope.addDireccion = function(  ){
        if (newMarker == null){
            newMarker = new google.maps.Marker({
                position: new google.maps.LatLng(36.721274 , -4.421399),
                map: map,
                draggable:true,
                icon: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png'
            });
        }
    };

    $scope.guardarIncidencia = function(  ){
        var usedName = false;
        angular.forEach($scope.incidencias, function(value){
            if (value.titulo == $scope.tituloIncidencia ){
                usedName = true;
            }
        });
        if (!usedName && !($scope.equiposSeleccionados.length == 0 && equiposSeleccionadosGlobal == 0) ){
            if (newMarker != null){
                newMarker.setDraggable(false);
                markerMap.set($scope.tituloIncidencia,newMarker);
                
                newMarker.setTitle($scope.tituloIncidencia);

                google.maps.event.addListener(newMarker, 'click', (function (newMarker) {
                    return function () {
                        $scope.cargarIncidencia( newMarker.getTitle() );
                    }
                })(newMarker));
            }

            
            var unionEquipos = Array.from(new Set (equiposSeleccionadosGlobal.concat($scope.equiposSeleccionados)));            
            equiposEnIncidencias = equiposEnIncidencias.concat(unionEquipos);
            $scope.newIncidencia = Incidencia.create({ titulo: $scope.tituloIncidencia, fecha: $scope.CurrentDate, descripcion:$scope.descripcionIncidencia, participantes: unionEquipos,latitud:newMarker.getPosition().lat() , longitud:newMarker.getPosition().lng() , activa: true , topologia: $scope.topologiaIncidencia, prioridad: $scope.prioridadIncidencia});
            equiposSeleccionadosGlobal = [];
            
            crearIncidencia($scope.newIncidencia, $scope.equiposSeleccionados);
            
            
            // por si los equipos guardasen la incidencia actual 
            
            angular.forEach($scope.equiposSeleccionados, function(value) {
                Equipo.findOne({filter: {where: {nombre: value}, limit: 1 }},function (data){
                    Equipo.prototype$patchAttributes({ id: data.id }, {incidenciaActual:$scope.newIncidencia.titulo });                
                });
            });
            $scope.incidencias.push($scope.newIncidencia);

                
            chatRow.attr('class','col-md-4 visible-print-block');
            mapRow.attr('class','col-md-4 visible-print-none');
            incidenciasRow.attr('class','col-md-4 visible-print-none');
            addIncidenciaRow.attr('class','col-md-4 visible-print-block');
            antiguasIncidenciasRow.attr('class','col-md-4 visible-print-block');
            createEquipoRow.attr('class','col-md-4 visible-print-block');
            createAdminRow.attr('class','col-md-4 visible-print-block');

            newMarker = null;
            creandoIncidencia = 0;
            $scope.tituloIncidencia = "";
            $scope.descripcionIncidencia = "";
            $scope.topologiaIncidencia = "";
            $scope.prioridadIncidencia = "";
            
        }
        
    };

    $scope.volverIncidencias = function(  ){       
        chatRow.attr('class','col-md-4 visible-print-block');
        mapRow.attr('class','col-md-4 visible-print-none');
        incidenciasRow.attr('class','col-md-4 visible-print-none');
        addIncidenciaRow.attr('class','col-md-4 visible-print-block');
        antiguasIncidenciasRow.attr('class','col-md-4 visible-print-block');
        createEquipoRow.attr('class','col-md-4 visible-print-block');
        createAdminRow.attr('class','col-md-4 visible-print-block');
        creandoIncidencia = 0;
        
        if (newMarker != null){
            newMarker.setMap(null);            
        }
        angular.element("#listadoAntiguasIncidencias").attr('class','list-group visible-print-none');
        angular.element("#antiguaIncidencia").attr('class','visible-print-block');

    };

    

    $scope.listarAdmins = function (){
        $scope.admins = Admin.find({}, function (){
            $scope.admin = null;
            chatRow.attr('class','col-md-4 visible-print-block');
            mapRow.attr('class','col-md-4 visible-print-block');
            incidenciasRow.attr('class','col-md-4 visible-print-block');
            addIncidenciaRow.attr('class','col-md-4 visible-print-block');
            antiguasIncidenciasRow.attr('class','col-md-4 visible-print-block');
            createEquipoRow.attr('class','col-md-4 visible-print-block');
            createAdminRow.attr('class','col-md-4 visible-print-none');
            angular.element('#resultadoCreateAdmin').attr('class','visible-print-block');
            angular.element('#formCreateAdmin').attr('class','visible-print-block');      
            angular.element('#listadoAdmins').attr('class','list-group visible-print-none');  
            creandoIncidencia = 0;
            
            if (newMarker != null){
                newMarker.setMap(null);            
            }
        });    
    };

    $scope.borrarAdmin = function (index){
        Admin.deleteById({
            id: $scope.admins[index].id
          })
          .$promise
          .then(function() {
            console.log('deleted');
            $scope.admins.splice(index, 1);            
          });
    }

    $scope.addAdmin = function (){
        $scope.admin = null;
        $scope.nombreAdmin = null;
        $scope.passwordAdmin = null;
        angular.element('#formCreateAdmin').attr('class','visible-print-none');      
        angular.element('#listadoAdmins').attr('class','list-group visible-print-block');      
    }

    $scope.editarAdmin = function (index) {
        $scope.admin = $scope.admins[index];
        $scope.nombreAdmin = $scope.admin.name;
        $scope.passwordAdmin = $scope.admin.password;
        angular.element('#formCreateAdmin').attr('class','visible-print-none');      
        angular.element('#listadoAdmins').attr('class','list-group visible-print-block');      
    };
    
    $scope.guardarAdmin = function(){
        if ($scope.admin == null){
            Admin.find ({filter:{where:{ name: $scope.nombreAdmin }, limit: 1}}, function (data){
                if (data.length == 0){
                    var auxAdmin = Admin.create({name: $scope.nombreAdmin, password: $scope.passwordAdmin});
                    $scope.admins.push(auxAdmin);                    
                    angular.element('#resultadoCreateAdmin').attr('innerHTML','Administrador creado con exito');
                    angular.element('#resultadoCreateAdmin').attr('class','visible-print-none');
                    angular.element('#formCreateAdmin').attr('class','visible-print-block');      
                    angular.element('#listadoAdmins').attr('class','list-group visible-print-none');
                }else{
                    angular.element('#resultadoCreateAdmin').attr('innerHTML','Error: el nombre del administrador ya existe');
                    angular.element('#resultadoCreateAdmin').attr('class','visible-print-none');
                }
            });                    
        }else{
            Admin.prototype$patchAttributes({ id: $scope.admin.id }, {name: $scope.nombreAdmin, password: $scope.passwordAdmin }, function (){
                $scope.admins = Admin.find({}, function (){
                    angular.element('#formCreateAdmin').attr('class','visible-print-block');      
                    angular.element('#listadoAdmins').attr('class','list-group visible-print-none'); 
                });            
            });                            
        }
    }

    $scope.volverAdmins = function (){
        angular.element('#formCreateAdmin').attr('class','visible-print-block');      
        angular.element('#listadoAdmins').attr('class','list-group visible-print-none'); 
    };

    $scope.volverEquipos = function (){
        angular.element('#formCreateEquipo').attr('class','visible-print-block');      
        angular.element('#listadoEquipos').attr('class','list-group visible-print-none'); 
    };

    
    $scope.listarEquipos = function (){
        $scope.equipos = Equipo.find({},function (){
            $scope.equipo = null;
            chatRow.attr('class','col-md-4 visible-print-block');
            mapRow.attr('class','col-md-4 visible-print-block');
            incidenciasRow.attr('class','col-md-4 visible-print-block');
            addIncidenciaRow.attr('class','col-md-4 visible-print-block');
            antiguasIncidenciasRow.attr('class','col-md-4 visible-print-block');
            createEquipoRow.attr('class','col-md-4 visible-print-none');
            createAdminRow.attr('class','col-md-4 visible-print-block');
            angular.element('#resultadoCreateAdminEquipo').attr('class','visible-print-block');
            angular.element('#formCreateEquipo').attr('class','visible-print-block');      
            angular.element('#listadoEquipos').attr('class','list-group visible-print-none'); 
            if (newMarker != null){
                newMarker.setMap(null);            
            }            
            creandoIncidencia = 0;
            
        });    
    };

    $scope.borrarEquipo = function (index){
        Equipo.deleteById({
            id: $scope.equipos[index].id
          })
          .$promise
          .then(function() {
            console.log('deleted');
          });
          $scope.equipos.splice(index, 1);
    }

    $scope.addEquipo = function (){
        $scope.equipo = null;
        $scope.nombreEquipo = null;
        $scope.passwordEquipo = null;
        $scope.codigoDispositivoEquipo = null;
        angular.element('#formCreateEquipo').attr('class','visible-print-none');      
        angular.element('#listadoEquipos').attr('class','list-group visible-print-block');      
    }

    $scope.editarEquipo = function (index) {
        $scope.equipo = $scope.equipos[index];
        $scope.nombreEquipo = $scope.equipo.nombre;
        $scope.passwordEquipo = $scope.equipo.password;
        $scope.codigoDispositivoEquipo = $scope.equipo.codigoDispositivo;
        angular.element('#formCreateEquipo').attr('class','visible-print-none');      
        angular.element('#listadoEquipos').attr('class','list-group visible-print-block');      
    };
    
    $scope.guardarEquipo = function(){
        if ($scope.equipo == null){
            Equipo.find ({filter:{where:{ nombre: $scope.nombreEquipo },  limit: 1}}, function (data){
                if (data.length == 0){
                    $scope.equipos.push( Equipo.create({nombre: $scope.nombreEquipo, password: $scope.passwordEquipo, codigoDispositivo: $scope.codigoDispositivoEquipo,  incidenciaActual: ""}));                    
                    angular.element('#resultadoCreateEquipo').attr('innerHTML','Administrador creado con exito');
                    angular.element('#resultadoCreateEquipo').attr('class','visible-print-none');
                    angular.element('#formCreateEquipo').attr('class','visible-print-block');      
                    angular.element('#listadoEquipos').attr('class','list-group visible-print-none');
                }else{
                    angular.element('#resultadoCreateEquipo').attr('innerHTML','Error: el nombre del equipo ya existe');
                    angular.element('#resultadoCreateEquipo').attr('class','visible-print-none');
                }
            });                    
        }else{
            Equipo.prototype$patchAttributes({ id: $scope.equipos.id }, {nombre: $scope.nombreEquipos, password: $scope.passwordEquipo, codigoDispositivo: $scope.codigoDispositivoEquipo });                            
            $scope.equipos = Equipo.find();            
            angular.element('#formCreateEquipo').attr('class','visible-print-block');      
            angular.element('#listadoEquipos').attr('class','list-group visible-print-none');  
        }
    }

    $scope.mostrarSiguientesIncidencias = function (){
        if ($scope.contadorIncidencias < $scope.numeroIncidencias){
            $scope.contadorIncidencias += 10;
            Incidencia.find({filter:{ 
                order: 'fecha DESC',
                limit: 10,
                skip: $scope.contadorIncidencias 
            }}, function (data){
                $scope.antiguasIncidencias = data;
            });
        }
    };

    $scope.mostrarAnterioresIncidencias = function (){
        if ($scope.contadorIncidencias > 9){
            $scope.contadorIncidencias -= 10; 
            Incidencia.find({ filter:{ 
                order: 'fecha DESC',
                limit: 10,
                skip: $scope.contadorIncidencias 
            }},function (data){
                $scope.antiguasIncidencias = data;
            });                 
        }
    };

    $scope.abrirAntiguaIncidencia = function ( index ){
        $scope.antiguaIncidencia =  $scope.antiguasIncidencias[index];
        angular.element("#listadoAntiguasIncidencias").attr('class','list-group visible-print-block');
        angular.element("#antiguaIncidencia").attr('class','visible-print-none');
    }

    $scope.borrarAntiguaIncidenciaDirecto = function ( index ){
        Incidencia.deleteById({
            id:$scope.antiguasIncidencias[index].id
        }).$promise.then(function() {

            $scope.antiguasIncidencias = Incidencia.find({ filter:{ 
                order: 'fecha DESC',
                limit: 10,
                skip: $scope.contadorIncidencias 
            }});

         //   $scope.antiguasIncidencias.splice(index,1);
            
            console.log("borrado bien"); 
        });
    };

    $scope.borrarAntiguaIncidencia = function(  ){
        Incidencia.deleteById({
            id: $scope.antiguaIncidencia.id
        }).$promise.then(function() {
            $scope.antiguasIncidencias = Incidencia.find({ filter:{ 
                order: 'fecha DESC',
                limit: 10,
                skip: $scope.contadorIncidencias 
            },function (data){
                angular.element("#listadoAntiguasIncidencias").attr('class','list-group visible-print-none');
                angular.element("#antiguaIncidencia").attr('class','visible-print-block');
            }});   
            console.log("borrado bien"); 
        });
    };

    $scope.volverAntiguasIncidencias = function(  ){       
        angular.element("#listadoAntiguasIncidencias").attr('class','list-group visible-print-none');
        angular.element("#antiguaIncidencia").attr('class','visible-print-block');

    };

    $scope.oldIncidencias = function (){
        $scope.contadorIncidencias = 0;
        Incidencia.count(function(data){
            $scope.numeroIncidencias = data.count;
        });
        $scope.paginaActual = 0;
        $scope.numeroPaginas = $scope.numeroIncidencias/10;
        
        Incidencia.find({ filter:{ 
            order: 'fecha DESC',
            limit: 10,
            skip: $scope.contadorIncidencias 
        }}, function (data){
            $scope.antiguasIncidencias = data;
        
            chatRow.attr('class','col-md-4 visible-print-block');
            mapRow.attr('class','col-md-4 visible-print-block');
            incidenciasRow.attr('class','col-md-4 visible-print-block');
            addIncidenciaRow.attr('class','col-md-4 visible-print-block');
            antiguasIncidenciasRow.attr('class','col-md-4 visible-print-none');
            createEquipoRow.attr('class','col-md-4 visible-print-block');
            createAdminRow.attr('class','col-md-4 visible-print-block');
    
            angular.element("#listadoAntiguasIncidencias").attr('class','list-group visible-print-none');
            angular.element("#antiguaIncidencia").attr('class','visible-print-block');

            if (newMarker != null){
                newMarker.setMap(null);            
            }         
            creandoIncidencia = 0;
            
        });

    };

    $scope.desconectar = function (){
        $scope.userName = '';
        $scope.userPassword = '';
        angular.element('#loginPage').attr('class','container text-center visible-print-none');;
        angular.element('#mainPage').attr('class','call-page container visible-print-block');;

        hangUp ();
    }
    
});

