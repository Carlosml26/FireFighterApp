
var map;
var markerMap = new Map();
var target = {
    latitude : 0,
    longitude: 0,
};
var creandoIncidencia = 0;


function newLocation(newLat,newLng){
      map.setCenter({
          lat : newLat,
          lng : newLng
      });
  }

function cargarCoordenadas(key,latitud,longitud){
    var marker;
    if (markerMap.has(key)){
        marker = markerMap.get(key);
        marker.setPosition(new google.maps.LatLng(latitud, longitud));
    }else{
        var colorEtiqueta;
        if (equiposEnIncidencias.includes(key)){
            colorEtiqueta = 'white';
        }else{
            colorEtiqueta = 'black';
        }
        marker = new google.maps.Marker({
            position: new google.maps.LatLng(latitud,longitud),
            map: map,
            title: '0',
            label: {
                text: key,
                color: colorEtiqueta
            }
        });
        google.maps.event.addListener(marker, 'click', (function (marker, i) {
            return function () {
                if (creandoIncidencia == 1 && !equiposEnIncidencias.includes(key)){
                    if (marker.getTitle() == '0'){
                        marker.setTitle('1');
                        equiposSeleccionadosGlobal.push(key); 
                        marker.setLabel({
                            text: key,
                            color: 'white'
                        });    
                    }else{
                        marker.setTitle('0');
                        equiposSeleccionadosGlobal.splice(equiposSeleccionadosGlobal.indexOf(key),1);    
                        marker.setLabel({
                            text: key,
                            color: 'black'
                        });                                                            
                    }
                }
            }
        })(marker, i));
        
        markerMap.set(key,marker);
    }

}

function cargarCoordenadasEquipo(key,latitud,longitud){
    var marker;
    if (markerMap.has(key)){
        marker = markerMap.get(key);
        marker.setPosition(new google.maps.LatLng(latitud, longitud));
    }else{
        marker = new google.maps.Marker({
            position: new google.maps.LatLng(latitud,longitud),
            map: map,
            title: '0',
            label: {
                text: key,
                color: 'black'
            }
        });        
        markerMap.set(key,marker);
    }

}

function eliminarMarker ( key ){
    if(markerMap.has(key)){
        var marker = markerMap.get(key);
        marker.setMap(null);
        markerMap.delete(key);
    }
};

function cargarCoordenadasIncidencia(key,latitud,longitud){
    console.log(key);
    var marker;
    marker = new google.maps.Marker({
        position: new google.maps.LatLng(latitud,longitud),
        map: map,
        icon: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png'
    });

    google.maps.event.addListener(marker, 'click', (function (marker) {
        map.setCenter(marker.getPosition());
    })(marker));

    markerMap.set(key,marker);
}

function moveToLocation(lat, lng){
    var center = new google.maps.LatLng(lat, lng);
    // using global variable:
    map.panTo(center);
}

function initMap() {
    var mapOptions = {
        center: new google.maps.LatLng(36.721274 , -4.421399),
        zoom: 12,
        mapTypeId: "roadmap"
    };

    map = new google.maps.Map(document.getElementById("map"), mapOptions);

// To add the marker to the map, call setMap();

    

    infoWindow = new google.maps.InfoWindow();

/*
    google.maps.event.addListener(marker, 'click', (function (marker, i) {
        return function () {

        }
    })(marker, i));
*/
}

function coords( position ){
    var crd = position.coords;
    
      if (target.latitude === crd.latitude && target.longitude === crd.longitude) {
        console.log('No te has movido');
        //navigator.geolocation.clearWatch(id);
      } else {
        send({
            type: "update",
            origen: myName,
            lat: position.coords.latitude,
            lng: position.coords.longitude
        });

        cargarCoordenadas(myName,position.coords.latitude,position.coords.longitude);   
        
        target.latitude = crd.latitude;
        target.longitude = crd.longitude;
      }
};