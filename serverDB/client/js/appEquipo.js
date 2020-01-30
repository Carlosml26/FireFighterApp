var myApp = angular.module('myItems', ['lbServices']);

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

myApp.controller("myItemsController", function ($scope, $http,$location , Equipo){
    $scope.userName = '';
    $scope.userPassword = '';
    var el = angular.element('#loginErrorAlert');
    el.attr('style', 'display: none;');


    $scope.login = function(){
        
        if ($scope.userName != '' && $scope.userPassword != ''){
            el.attr('style', 'display: none;');

            Equipo.findOne({filter:{where: {nombre: $scope.userName }, limit: 1}}, function(data) {
                if( data.password == $scope.userPassword){
                    myName = data.nombre; 
                    loginUser();
                    
                }else{                    
                    el.attr('style', 'display: block;');
                }            
            });
        }else{            
            el.attr('style', 'display: block;');
        }
    };
});
