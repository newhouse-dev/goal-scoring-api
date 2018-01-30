angular.module('goalApp', [])
    .controller('mainController', ($scope, $http, $window) => {
        $scope.data = {};
        $scope.httpOptions = {
            "headers": {
                "apiKey": "683c952c-0ea2-4b1d-84c9-b3945871d1c0"
            }
        }

        $scope.data.processGoal = () => {
            $http.get('/api/goal', $scope.httpOptions)
                .success((result) => {
                    $scope.data.result = result;
                })
                .error((error) => {
                    console.log('Error:', error);
                });
        };

        $scope.data.instavom = () => {
            $http.get('/api/instavom', $scope.httpOptions)
                .success((result) => {
                    $scope.data.result = result;
                })
                .error((error) => {
                    console.log('Error', error);
                });
        };

        $scope.data.reset = () => {
            $http.get('/api/reset', $scope.httpOptions)
                .success((result) => {
                    $scope.data.result = result;
                })
                .error((error) => {
                    console.log('Error', error);
                });
        };
    });