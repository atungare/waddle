'use strict';

angular.module('waddle', [
  'waddle.controllers',
	'waddle.directives',
	'ui.router'
])

.config(function ($stateProvider, $urlRouterProvider) {
  $stateProvider
    .state('frontpage', {
      url: '/',
      templateUrl: 'modules/pages/frontpage/frontpage.html',
      controller: 'FrontpageController'
    });

  $urlRouterProvider.otherwise('/');

  // $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|mailto|file):/);
});