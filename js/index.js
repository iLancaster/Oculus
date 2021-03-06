/* global angular, DeviceManager, RiftSandbox, Mousetrap */
testData =[];

(function () {
'use strict';

var File = (function () {
  var constr = function (name, contents) {
    this.name = name || 'Example';
    var defaultContents = ('\
      var t3 = THREE;\n\
      var terrain = testData\n\
      var geometry = new THREE.PlaneGeometry(200, 200, 271, 148);\n\
      var light = new t3.DirectionalLight( 0xffffff, 1 );\n\
      light.position.set(-400, 1, 0);\n\
      scene.add(light);\n\
      var light2 = new t3.DirectionalLight( 0xffffff, 1 );\n\
      light2.position.set(-400, 1, -300);\n\
      scene.add(light2);\n\
        var loader = new t3.STLLoader();\n\
        loader.addEventListener( "load", function ( event ) {\n\
          console.log("LOADED");\n\
          var geometry = event.content;\n\
          var material = new t3.MeshPhongMaterial( { ambient: 0xff5533, color: 0xff5533, specular: 0x111111,} );\n\
          var mesh = new t3.Mesh( geometry, material );\n\
          var box = new THREE.Box3().setFromObject( mesh );\n\
          mesh.position.set( -400, 5, -150 );\n\
          mesh.rotation.set( 67.5,0,100);\n\
          mesh.scale.set( 1, 1, 1);\n\
          console.log( box.min, box.max, box.size() );\n\
          scene.add( mesh );\n\
        } );\n\
        loader.load("./stl/Castle-Wall.stl" );\
    '.replace(/\n {6}/g, '\n').replace(/^\s+|\s+$/g, ''));
    this.contents = contents === undefined ? defaultContents : contents;
    this.selected = true;
  };
  constr.prototype.findNumberAt = function (index) {
    return this.contents.substring(index).match(/-?\d+\.?\d*/)[0];
  };
  constr.prototype.spinNumber = function (number, direction, amount) {
    if (number.indexOf('.') === -1) {
      return (parseInt(number, 10) + direction * amount).toString();
    }
    else {
      return (parseFloat(number) + direction * amount).toFixed(2);
    }
  };
  constr.prototype.spinNumberAt = function (
    index, direction, amount, originalNumber
  ) {
    var number = this.findNumberAt(index);
    originalNumber = originalNumber || number;
    var newNumber = this.spinNumber(originalNumber, direction, amount);
    this.contents = (
      this.contents.substring(0, index) +
      newNumber +
      this.contents.substring(index + number.length)
    );
  };
  constr.prototype.recordOriginalNumberAt = function (index) {
    this.originalIndex = index;
    this.originalNumber = this.findNumberAt(index);
  };
  constr.prototype.offsetOriginalNumber = function (offset) {
    this.spinNumberAt(this.originalIndex, 1, offset, this.originalNumber);
  };
  return constr;
}());

var Sketch = (function () {
  var constr = function (name, files) {
    this.name = name || 'Example Sketch';
    this.files = files || [
      new File()
    ];
  };
  constr.prototype.getCode = function () {
    var code = '';
    for (var i = 0; i < this.files.length; i++) {
      code += this.files[i].contents;
    }
    return code;
  };
  constr.prototype.addFile = function () {
    this.files.push(new File('Untitled', ''));
  };
  return constr;
}());


angular.module('index', [])
  .controller('SketchController', ['$scope', function($scope) {
    // TODO: lol, this controller is out of control. Refactor and maybe actually
    // use Angular properly.

    navigator.getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
    navigator.getUserMedia(
      {video: true},
      function (stream) {
        var monitor = document.getElementById('monitor');
        monitor.src = window.URL.createObjectURL(stream);
      },
      function () {}
    );

    var autosave = localStorage.getItem('autosave');
    var files;
    /*if (autosave) {
      files = [new File('autosave', autosave)];
      $scope.sketch = new Sketch('autosave', files);
    }
    else {*/

    var test = [];

    $scope.sketch = new Sketch(files);

    // TODO: Most of this should be in a directive instead of in the controller.
    var mousePos = {x: 0, y: 0};
    window.addEventListener(
      'mousemove',
      function (e) {
        mousePos.x = e.clientX;
        mousePos.y = e.clientY;
      },
      false
    );

    this.sketchLoop = function () {};

    this.mainLoop = function () {
      window.requestAnimationFrame( this.mainLoop.bind(this) );
      // HACK: I really need to turn this DOM manipulation into a directive.
      if (!this.textarea) {
        this.textarea = document.querySelector('textarea');
      }

      // Apply movement
      if (this.deviceManager.sensorDevice) {
        if (this.riftSandbox.vrMode) {
          this.riftSandbox.setHmdPositionRotation(
            this.deviceManager.sensorDevice.getState());
        }
        this.riftSandbox.setBaseRotation();
        this.riftSandbox.updateCameraPositionRotation();
      }
      if (!this.deviceManager.sensorDevice || !this.riftSandbox.vrMode) {
        this.riftSandbox.setRotation({
          y: mousePos.x / window.innerWidth * Math.PI * 2
        });
        this.riftSandbox.setBaseRotation();
        this.riftSandbox.updateCameraPositionRotation();
      }

      try {
        this.sketchLoop();
      }
      catch (err) {
        if ($scope.error === null) {
          $scope.error = err.toString();
          if (!$scope.$$phase) { $scope.$apply(); }
        }
      }

      this.riftSandbox.render();
    };

    this.deviceManager = new DeviceManager();
    this.riftSandbox = new RiftSandbox(window.innerWidth, window.innerHeight);

    this.deviceManager.onResizeFOV = function (
      renderTargetSize, fovLeft, fovRight
    ) {
      this.riftSandbox.setFOV(fovLeft, fovRight);
    }.bind(this);

    this.deviceManager.onHMDDeviceFound = function (hmdDevice) {
      var eyeOffsetLeft = hmdDevice.getEyeTranslation("left");
      var eyeOffsetRight = hmdDevice.getEyeTranslation("right");
      this.riftSandbox.setCameraOffsets(eyeOffsetLeft, eyeOffsetRight);
    }.bind(this);

    var spinNumberAndKeepSelection = function (direction, amount) {
      var start = this.textarea.selectionStart;
      $scope.sketch.files[0].spinNumberAt(start, direction, amount);
      if (!$scope.$$phase) { $scope.$apply(); }
      this.textarea.selectionStart = this.textarea.selectionEnd = start;
    }.bind(this);

    var offsetNumberAndKeepSelection = function (offset) {
      var start = this.textarea.selectionStart;
      $scope.sketch.files[0].offsetOriginalNumber(offset);
      if (!$scope.$$phase) { $scope.$apply(); }
      this.textarea.selectionStart = this.textarea.selectionEnd = start;
    }.bind(this);

    this.handStart = this.handCurrent = null;
    this.altPressed = this.shiftPressed = false;
    Leap.loop({}, function (frame) {
      if (frame.hands.length) {
        this.handCurrent = frame;
        if (this.altPressed && this.handStart) {
          var hand = frame.hands[0];
          var handTranslation = hand.translation(this.handStart);
          var factor = this.shiftPressed ? 10 : 100;
          var offset = Math.round(handTranslation[1] / factor * 1000) / 1000;
          offsetNumberAndKeepSelection(offset);
        }
      }
      this.previousFrame = frame;
    }.bind(this));

    var flag=0;

    OAuth.initialize('bnVXi9ZBNKekF-alA1aF7PQEpsU');
    var apiCache = {};
    var api = _.throttle(function (provider, url, data, callback) {
      var cacheKey = url + JSON.stringify(data);
      var cacheEntry = apiCache[cacheKey];
      if (cacheEntry && (Date.now() - cacheEntry.lastCall) < 1000 * 60 * 5) {
        callback(cacheEntry.data);
        return;
      }
      OAuth.popup(
        provider,
        {cache: true}
      ).done(function(result) {
        result.get(
          url,
          {data: data, cache: true}
        ).done(function (data) {
          apiCache[cacheKey] = {
            lastCall: Date.now(),
            data: data
          };
          callback(data);
        });
      });
    }, 1000);

    window.addEventListener(
      'resize',
      this.riftSandbox.resize.bind(this.riftSandbox),
      false
    );

    $scope.is_editor_visible = false;
    var domElement = this.riftSandbox.container;
    this.bindKeyboardShortcuts = function () {
      Mousetrap.bind('alt+v', function () {
        this.riftSandbox.toggleVrMode();
        if (domElement.mozRequestFullScreen) {
          domElement.mozRequestFullScreen({
            vrDisplay: this.deviceManager.hmdDevice });
        }
        else if (domElement.webkitRequestFullscreen) {
          domElement.webkitRequestFullscreen({
            vrDisplay: this.deviceManager.hmdDevice });
        }
        return false;
      }.bind(this));
      Mousetrap.bind('alt+z', function () {
        this.deviceManager.sensorDevice.zeroSensor();
        return false;
      }.bind(this));
      Mousetrap.bind('alt+e', function () {
          if(this.riftSandbox.flag===0)
            this.riftSandbox.flag=1;
          else
            this.riftSandbox.flag=0;
          this.riftSandbox.updateCameraPositionRotation();
        return false;
      }.bind(this));
      Mousetrap.bind('alt+u', function () {
        spinNumberAndKeepSelection(-1, 10);
        return false;
      });
      Mousetrap.bind('alt+i', function () {
        spinNumberAndKeepSelection(1, 10);
        return false;
      });
      Mousetrap.bind('alt+j', function () {
        spinNumberAndKeepSelection(-1, 1);
        return false;
      });
      Mousetrap.bind('alt+k', function () {
        spinNumberAndKeepSelection(1, 1);
        return false;
      });
      Mousetrap.bind('alt+m', function () {
        spinNumberAndKeepSelection(-1, 0.1);
        return false;
      });
      Mousetrap.bind('alt+,', function () {
        spinNumberAndKeepSelection(1, 0.1);
        return false;
      });

      var MOVEMENT_RATE = 10;
      var ROTATION_RATE = 0.1;

      Mousetrap.bind('w', function () {
          this.riftSandbox.setVelocity(MOVEMENT_RATE);
      }.bind(this), 'keydown');
      Mousetrap.bind('w', function () {
          this.riftSandbox.setVelocity(0);
      }.bind(this), 'keyup');

      Mousetrap.bind('s', function () {
          this.riftSandbox.setVelocity(-MOVEMENT_RATE);
      }.bind(this), 'keydown');
      Mousetrap.bind('s', function () {
          this.riftSandbox.setVelocity(0);
      }.bind(this), 'keyup');

      Mousetrap.bind('a', function () {
          this.riftSandbox.BaseRotationEuler.y += ROTATION_RATE;
      }.bind(this));
      Mousetrap.bind('d', function () {
          this.riftSandbox.BaseRotationEuler.y -= ROTATION_RATE;
      }.bind(this));

      Mousetrap.bind('q', function () {
          this.riftSandbox.BaseRotationEuler.y += Math.PI / 4;
      }.bind(this));
      Mousetrap.bind('e', function () {
          this.riftSandbox.BaseRotationEuler.y -= Math.PI / 4;
      }.bind(this));

      Mousetrap.bind(['shift', 'alt+shift'], function () {
        if (this.shiftPressed) { return false; }
        this.shiftPressed = true;
        return false;
      }.bind(this), 'keydown');
      Mousetrap.bind('shift', function () {
        this.shiftPressed = false;
        return false;
      }.bind(this), 'keyup');

      Mousetrap.bind('alt', function () {
        if (this.altPressed) { return false; }
        var start = this.textarea.selectionStart;
        $scope.sketch.files[0].recordOriginalNumberAt(start);
        this.handStart = this.handCurrent;
        this.altPressed = true;
        return false;
      }.bind(this), 'keydown');
      Mousetrap.bind('alt', function () {
        this.altPressed = false;
        return false;
      }.bind(this), 'keyup');
    }.bind(this);
    this.bindKeyboardShortcuts();

    var toggleVrMode = function () {
      if (
        !(document.mozFullScreenElement || document.webkitFullScreenElement) &&
        this.riftSandbox.vrMode
      ) {
        $scope.isInfullscreen = false;
        if (!$scope.$$phase) { $scope.$apply(); }
        this.riftSandbox.toggleVrMode();
      }
      else {
        $scope.isInfullscreen = true;
        // Guesstimate that it's DK1 based on resolution. Ideally getVRDevices
        // would give us a model name but it doesn't in Firefox.
        if (window.innerWidth < 1800) {
          $scope.isDK1 = true;
        }
        if (!$scope.$$phase) { $scope.$apply(); }
      }
    }.bind(this);
    document.addEventListener('mozfullscreenchange', toggleVrMode, false);
    document.addEventListener('webkitfullscreenchange', toggleVrMode, false);

    this.riftSandbox.resize();

    // We only support a specific WebVR build at the moment.
    if (!navigator.userAgent.match('Firefox/34')) {
      $scope.seemsUnsupported = true;
    }
    this.deviceManager.onError = function () {
      $scope.seemsUnsupported = true;
      if (!$scope.$$phase) { $scope.$apply(); }
    }.bind(this);

    this.deviceManager.init();
    this.mainLoop();

    $scope.$watch('sketch.getCode()', function (code) {

      this.riftSandbox.clearScene();
      var _sketchLoop;
      $scope.error = null;
      try {
        /* jshint -W054 */
        var _sketchFunc = new Function(
          'scene', 'camera', 'api',
          '"use strict";\n' + code
        );
        /* jshint +W054 */
        _sketchLoop = _sketchFunc(
          this.riftSandbox.scene, this.riftSandbox.cameraPivot, api);
      }
      catch (err) {
        $scope.error = err.toString();
      }
      if (_sketchLoop) {
        this.sketchLoop = _sketchLoop;
      }
      localStorage.setItem('autosave', code);
    }.bind(this));
  }]);
}());
