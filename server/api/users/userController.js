var _ = require('lodash');

var foursquareUtils = require('../../utils/foursquareUtils.js');
var facebookUtils = require('../../utils/facebookUtils.js');
var instagramUtils = require('../../utils/instagramUtils.js');

var User = require('./userModel.js');
var Place = require('../places/placeModel.js');
var Checkin = require('../checkins/checkinModel.js');

var userController = {};

userController.userLogin = function (req, res) {

  var userData = req.body;
  var user;
  var FBAccessToken;
  var userFBTaggedPostsData = [];
  var userFBPhotoData = [];
  var userFBStatusesData = [];
  var userFBFriendsData;
  var combinedFBCheckins;
  var alreadyExists = false;

  // Start creation of new user or update and retrieval of existing user
  User.createUniqueUser(userData)
  .then(function (userNode) { 
    //note: this has the user node
    //console.dir(userNode.node._data.data)
    user = userNode;
    return facebookUtils.exchangeFBAccessToken(userData.fbToken);
  })
  // Store acces token on scope, Get profile pictures from Facebook
  .then(function (fbReqData) {
    FBAccessToken = fbReqData.access_token
    return facebookUtils.getFBProfilePicture(userData.facebookID);
  })
  .then(function (fbPicData) {
    var properties = {
      'fbToken': FBAccessToken,
    };
    // Asks if facebook profile picture is a default silhouette
    if(fbPicData.data.is_silhouette === false) {
      properties['fbProfilePicture'] = fbPicData.data.url;
    }
    return user.setProperties(properties);
  })
  .then(function (userNode) { 
    user = userNode;
    return user.findAllCheckins(userData.facebookID)
  })
  //Path forks here for existing vs new users
  .then(function (checkinsAlreadyStored) {
    // console.log('fb checkins: ', checkinsAlreadyStored.length);
    // For existing users
    if (checkinsAlreadyStored.length) {
      user.findAllFriends()
      .then(function (neoUserData){
        var allData = {
          allCheckins: checkinsAlreadyStored,
          friends: neoUserData,
          fbProfilePicture: user.getProperty('fbProfilePicture'),
          name: user.getProperty('name'),
          footprintsCount: checkinsAlreadyStored.length
        }
        res.json(allData);
        res.status(200).end();
      })
    } else {
      // For new users, start chain of facebook requests.
      getAndParseFBData();
    }
  })
  .catch(function(err) {
    console.log(err);
    res.status(500).end();
  });

  // Start getting data for checkins and photos
  var getAndParseFBData = function () {

    facebookUtils.getFBFriends(user)
    .then(function (fbRawUserData) {
      // Friends data
      return user.addFriends(fbRawUserData.data);
    })
    .then(function (friends) {
      // Parse Friends data
      var allFriends = _.map(friends, function(friend){
        return friend.body.data[0][0].data;
      })
      userFBFriendsData = allFriends;

      //get tagged places
      return facebookUtils.getFBTaggedPosts(user);
    })
    .then(function (fbRawTaggedPostsData) {
      // parse Checkin data
      return facebookUtils.parseFBData(user, fbRawTaggedPostsData);
    })
    .then(function (fbParsedTaggedPostsData) {
      userFBTaggedPostsData = fbParsedTaggedPostsData;
      // get Picture data
      return facebookUtils.getFBPhotos(user);
    })
    .then(function (fbRawPhotoList) {
      // parse Photo data
      // console.log("# of photos", fbRawPhotoList.length)
      return facebookUtils.parseFBData(user, fbRawPhotoList); 
    })
    .then(function (fbParsedPhotoData) {
      // merge tagged places and photos
      userFBPhotoData = fbParsedPhotoData;
      combinedFBCheckins = userFBTaggedPostsData.concat(userFBPhotoData);
      //get statuses posted by user
      return facebookUtils.getFBStatuses(user);
    })
    .then(function (fbRawStatusList) {
      return facebookUtils.parseFBData(user, fbRawStatusList);
    })
    .then(function (fbParsedStatusesData) {
      userFBStatusesData = fbParsedStatusesData;
      combinedFBCheckins = combinedFBCheckins.concat(userFBStatusesData);
      console.log("combinedCheckins: " + combinedFBCheckins);
      return user.addCheckins(combinedFBCheckins);
    })
    .then(function (data) {
      return user.findAllCheckins(userData.facebookID);
    })
    .then(function (checkinsStored) {
      // console.log('fb checkins: ', checkinsStored.length);
      var allData = {
        allCheckins: checkinsStored,
        friends: userFBFriendsData
      };
      res.json(allData);
      res.status(200).end();
    })
    .catch(function(err) {
      console.log(err);
      res.status(500).end();
    });
  }
};

userController.addFoursquareData = function (req, res) {

  var userData = req.body;
  var user;

  console.log('add 4s data');

  User.find(userData)
  .then(function (userNode) { 
    user = userNode;
    return foursquareUtils.exchangeFoursquareUserCodeForToken(userData.foursquareCode);
  })
  .then(function (foursquareAccessToken) {
    return user.setProperty('fsqToken', foursquareAccessToken.access_token);
  })
  .then(function (userNode) {
    user = userNode;
    return foursquareUtils.getUserFoursquareIDFromToken(user);
  })
  .then(function (userFoursquareData) {
    return user.setProperty('foursquareID', userFoursquareData.response.user.id);
  })
  .then(function (userNode) {
    user = userNode;
    return foursquareUtils.tabThroughFoursquareCheckinHistory(user);
  })
  .then(function (foursquareHistoryBucket) {
    var allFoursquareCheckins = foursquareUtils.convertFoursquareHistoryToSingleArrayOfCheckins(foursquareHistoryBucket);
    var allParsedFoursquareCheckins = foursquareUtils.parseFoursquareCheckins(allFoursquareCheckins);
    console.log("4s checkin len:", allParsedFoursquareCheckins.length);
    return user.addCheckins(allParsedFoursquareCheckins);
  })
  .then(function (data) {
    console.log('4s: ', data);
    res.status(204).end();
  })
  .catch(function(err) {
    console.log(err);
    res.status(500).end();
  })
};

userController.addInstagramData = function (req, res) {

  var userData = req.body;
  var user;
  var igUserData;

  User.find(userData)
  .then(function (userNode) { 
    user = userNode;
    return instagramUtils.exchangeIGUserCodeForToken(userData.instagramCode);
  })
  .then(function (igData) {
    igUserData = igData;
    return user.setProperty('igToken', igUserData.access_token);
  })
  .then(function (userNode) { 
    user = userNode;
    return user.setProperty('instagramID', igUserData.user.id);
  })
  .then(function (userNode) { 
    user = userNode;
    return 'done';
  })
  .then(function (data) {
    console.log('ig: ', data);
    res.status(204).end();
  })
  .catch(function(err) {
    console.log(err);
    res.status(500).end();
  })

};

//
userController.getUserData = function (req, res){
  var userData = {
    facebookID: req.params.friend
  };
  var viewer = req.params.viewer;

  User.find(userData)
  .then(function (friend) {
    return friend.findAllCheckins(viewer);
  })
  .then(function (checkins) {
    // console.log("checkins: ", checkins.length)
    res.json(checkins);
    res.status(200).end();
  })
  .catch(function (err) {
    console.log(err);
    res.status(500).end();
  });
};

// Takes a facebookID and returns a footprint object with
// checkin and place keys, containing checkin and place data
userController.getBucketList = function (req, res){
  var facebookID = req.params.user;

  User.getBucketList(facebookID)
  .then(function (footprints) {
    res.json(footprints);
    res.status(200).end();
  })
  .catch(function (err) {
    console.log('req');
    console.log(err);
    res.status(500).end();
  });
};

module.exports = userController;
