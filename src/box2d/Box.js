/**

 Copyright 2011 Luis Montes

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

**/

/**
 * This wraps the box2d world that contains bodies, shapes, and performs the physics calculations.
 * @name Box
 * @class Box
 */

define([
  'dojo/_base/declare',
  'dojo/_base/lang'
], function(declare, lang){

  // box2d globals

  var B2Vec2 = Box2D.Common.Math.b2Vec2
    , B2BodyDef = Box2D.Dynamics.b2BodyDef
    , B2Body = Box2D.Dynamics.b2Body
    , B2FixtureDef = Box2D.Dynamics.b2FixtureDef
    , B2Fixture = Box2D.Dynamics.b2Fixture
    , B2World = Box2D.Dynamics.b2World
    , B2MassData = Box2D.Collision.Shapes.b2MassData
    , B2PolygonShape = Box2D.Collision.Shapes.b2PolygonShape
    , B2CircleShape = Box2D.Collision.Shapes.b2CircleShape
    , B2DebugDraw = Box2D.Dynamics.b2DebugDraw
    , B2RevoluteJointDef = Box2D.Dynamics.Joints.b2RevoluteJointDef;

  return declare(null, {
    intervalRate: 60,
    adaptive: false,
    width: 640,
    height: 480,
    scale: 30,
    bodiesMap: [],
    fixturesMap: [],
    world: null,
    gravityX: 0,
    gravityY: 10,
    allowSleep: true,
    resolveCollisions: false,
    contactListener: null,
    collisions: null,
    constructor: function(args){
      declare.safeMixin(this, args);
      if(args.intervalRate){
        this.intervalRate = parseInt(args.intervalRate, 10);
      }

      this.world = new B2World(new B2Vec2(this.gravityX, this.gravityY), this.allowSleep);

      if(this.resolveCollisions){
        this.addContactListener(this.contactListener || this);
      }
    },

    /**
      * Update the box2d physics calculations
      * @name Box#update
      * @function
    */
    update: function() {
      // TODO: use window.performance.now()???

      if(this.resolveCollisions){
        this.collisions = {};
      }

      var start = Date.now();
      var stepRate = (this.adaptive) ? (start - this.lastTimestamp) / 1000 : (1 / this.intervalRate);
      this.world.Step(stepRate /* frame-rate */, 10 /* velocity iterations */, 10 /*position iterations*/);
      this.world.ClearForces();
      return (Date.now() - start);
    },

    /**
      * Gets the current state of the objects in the box2d world.
      * @name Box#getState
      * @function
    */
    getState: function() {
      var state = {};
      for (var b = this.world.GetBodyList(); b; b = b.m_next) {
        if (b.IsActive() && typeof b.GetUserData() !== 'undefined' && b.GetUserData() !== null) {
          state[b.GetUserData()] = {
            x: b.GetPosition().x,
            y: b.GetPosition().y,
            angle: b.GetAngle(),
            center: {
              x: b.GetWorldCenter().x,
              y: b.GetWorldCenter().y
            },
            linearVelocity: b.m_linearVelocity,
            angularVelocity: b.m_angularVelocity
          };
          if(this.resolveCollisions){
            state[b.GetUserData()].collisions = this.collisions[b.GetUserData()] || null;
          }
        }
      }
      return state;
    },

    /**
      * Updates the state in the Entity objects that are modified by box2d calculations.
      * @name Box#updateExternalState
      * @function
      * @param {Object|Array} entities An array or map of Entity objects
    */
    updateExternalState: function(entities){
      //update the dyanmic shapes with box2d calculations
      var bodiesState = this.getState();
      for (var id in bodiesState) {
        var entity = world[id];
        if (entity){
          entity.update(bodiesState[id]);
        }
      }
    },

    setBodies: function(bodyEntities) {
      console.log('bodies',bodyEntities);
      for(var id in bodyEntities) {
        var entity = bodyEntities[id];
        this.addBody(entity);
      }
      this.ready = true;
    },

    /**
      * Add an Entity to the box2d world which will internally be converted to a box2d body and fixture
      * @name Box#addBody
      * @function
      * @param {Entity} entity Any Entity object
    */
    addBody: function(entity) {
      var bodyDef = new B2BodyDef();
      var fixDef = new B2FixtureDef();
      var i,j,points,vec,vecs;
      fixDef.restitution = entity.restitution;
      fixDef.density = entity.density;
      fixDef.friction = entity.friction;

      if(entity.staticBody){
        bodyDef.type =  B2Body.b2_staticBody;
      } else {
        bodyDef.type = B2Body.b2_dynamicBody;
      }

      bodyDef.position.x = entity.x;
      bodyDef.position.y = entity.y;
      bodyDef.userData = entity.id;
      bodyDef.linearDamping = entity.linearDamping;
      bodyDef.angularDamping = entity.angularDamping;
      var body = this.world.CreateBody(bodyDef);
      

      if (entity.radius) { //circle
        fixDef.shape = new B2CircleShape(entity.radius);
        body.CreateFixture(fixDef);
      } else if (entity.points) { //polygon
        points = [];
        for (i = 0; i < entity.points.length; i++) {
          vec = new B2Vec2();
          vec.Set(entity.points[i].x, entity.points[i].y);
          points[i] = vec;
        }
        fixDef.shape = new B2PolygonShape();
        fixDef.shape.SetAsArray(points, points.length);
        body.CreateFixture(fixDef);
      } else if(entity.polys) { //complex object
          for (j = 0; j < entity.polys.length; j++) {
              points = entity.polys[j];
              vecs = [];
              for (i = 0; i < points.length; i++) {
                  vec = new B2Vec2();
                  vec.Set(points[i].x, points[i].y);
                  vecs[i] = vec;
              }
              fixDef.shape = new B2PolygonShape();
              fixDef.shape.SetAsArray(vecs, vecs.length);
              body.CreateFixture(fixDef);
          }
      } else { //rectangle
        fixDef.shape = new B2PolygonShape();
        fixDef.shape.SetAsBox(entity.halfWidth, entity.halfHeight);
        body.CreateFixture(fixDef);
      }
         

      this.bodiesMap[entity.id] = body;
    },

    /**
      * Set the position of an entity.
      *
      * This must be done outside of the update() iteration!
      *
      * @name Box#setPosition
      * @function
      * @param {Number} bodyId The id of the Entity/Body
      * @param {Number} x The new x coordinate in box2d space
      * @param {Number} y The new y coordinate in box2d space
    */
    setPosition: function(bodyId, x, y){
      var body = this.bodiesMap[bodyId];
      body.SetPosition(new B2Vec2(x, y));
    },

    /**
      * Apply an impulse to a body at an angle in degrees
      *
      * This must be done outside of the update() iteration!
      *
      * @name Box#applyImpulseDegrees
      * @function
      * @param {Number} bodyId The id of the Entity/Body
      * @param {Number} degrees The angle in which to apply the impulse.
      * @param {Number} power The impulse power.
    */
    applyImpulseDegrees : function(bodyId, degrees, power) {
      var body = this.bodiesMap[bodyId];
      body.ApplyImpulse(
        new B2Vec2(Math.sin(degrees * (Math.PI / 180)) * power,
        Math.cos(degrees * (Math.PI / 180)) * power * -1),
        body.GetWorldCenter()
      );
    },

    /**
      * Apply a force to a body at an angle in degrees
      *
      * This must be done outside of the update() iteration!
      *
      * @name Box#applyForceDegrees
      * @function
      * @param {Number} bodyId The id of the Entity/Body
      * @param {Number} degrees The angle in which to apply the force.
      * @param {Number} power The power of the force. (The ability to destroy a planet is insignificant next to this)
    */
    applyForceDegrees : function(bodyId, degrees, power) {
      var body = this.bodiesMap[bodyId];
      body.ApplyForce(
        new B2Vec2(Math.sin(degrees * (Math.PI / 180)) * power,
        Math.cos(degrees * (Math.PI / 180)) * power * -1),
        body.GetWorldCenter()
      );
    },

    /**
      * Apply an impulse to a body at an angle in radians
      *
      * This must be done outside of the update() iteration!
      *
      * @name Box#applyImpulse
      * @function
      * @param {Number} bodyId The id of the Entity/Body
      * @param {Number} radians The angle in which to apply the impulse.
      * @param {Number} power The impulse power.
    */
    applyImpulse : function(bodyId, radians, power) {
      var body = this.bodiesMap[bodyId];
      body.ApplyImpulse(
        new B2Vec2(Math.sin(radians) * power,
        Math.cos(radians) * power * -1),
        body.GetWorldCenter()
      );
    },

    /**
      * Apply a force to a body at an angle in radians
      *
      * This must be done outside of the update() iteration!
      *
      * @name Box#applyForce
      * @function
      * @param {Number} bodyId The id of the Entity/Body
      * @param {Number} radians The angle in which to apply the force.
      * @param {Number} power The power of the force. (The ability to destroy a planet is insignificant next to this)
    */
    applyForce : function(bodyId, radians, power) {
      var body = this.bodiesMap[bodyId];
      body.ApplyForce(
        new B2Vec2(Math.sin(radians) * power,
        Math.cos(radians) * power * -1),
        body.GetWorldCenter()
      );
    },

    /**
      * Apply torque (rotation force) to a body.
      * Positive values are clockwise, negative values are counter-clockwise.
      *
      * This must be done outside of the update() iteration!
      *
      * @name Box#applyTorque
      * @function
      * @param {Number} bodyId The id of the Entity/Body
      * @param {Number} power The power of the torque.
    */
    applyTorque : function(bodyId, power) {
      var body = this.bodiesMap[bodyId];
      body.ApplyTorque(power);
    },

    /**
      * Remove a body from the box2d world
      *
      * This must be done outside of the update() iteration!
      *
      * @name Box#removeBody
      * @function
      * @param {Number} bodyId The id of the Entity/Body
    */
    removeBody: function(id) {
      if(this.bodiesMap[id]){
        this.bodiesMap[id].DestroyFixture(this.fixturesMap[id]);
        this.world.DestroyBody(this.bodiesMap[id]);
        //delete this.fixturesMap[id];
        delete this.bodiesMap[id];
      }
    },
    addContactListener: function(callbacks) {
      var listener = new Box2D.Dynamics.b2ContactListener();
      if (callbacks.beginContact) {
        listener.BeginContact = function(contact) {
          callbacks.beginContact(contact.GetFixtureA().GetBody().GetUserData(),
                                 contact.GetFixtureB().GetBody().GetUserData());
          };
      }
      if (callbacks.EndContact){

        listener.endContact = function(contact) {
          callbacks.endContact(contact.GetFixtureA().GetBody().GetUserData(),
                               contact.GetFixtureB().GetBody().GetUserData());
        };
      }
      if (callbacks.postSolve){

        listener.PostSolve = function(contact, impulse) {
          callbacks.postSolve(contact.GetFixtureA().GetBody().GetUserData(),
                               contact.GetFixtureB().GetBody().GetUserData(),
                               impulse.normalImpulses[0]);
        };
      }
      this.world.SetContactListener(listener);
    },

    /**
      * Add a revolute joint between two bodies at the center of the first body.
      *
      * This must be done outside of the update() iteration!
      *
      * @name Box#addRevoluteJoint
      * @function
      * @param {Number} body1Id The id of the first Entity/Body
      * @param {Number} body2Id The id of the second Entity/Body
      * @param {Object} jointAttributes Any box2d jointAttributes you wish to mixin to the joint.
    */
    addRevoluteJoint : function(body1Id, body2Id, jointAttributes) {
      var body1 = this.bodiesMap[body1Id];
      var body2 = this.bodiesMap[body2Id];
      var joint = new B2RevoluteJointDef();
      joint.Initialize(body1, body2, body1.GetWorldCenter());
      if (jointAttributes) {
        lang.mixin(joint, jointAttributes);
      }
      this.world.CreateJoint(joint);
    },
    beginContact: function(idA, idB){

    },
    endContact: function(idA, idB){

    },
    postSolve: function(idA, idB, impulse){
      this.collisions[idA] = this.collisions[idA] || [];
      this.collisions[idA].push({id: idB, impulse: impulse});
      this.collisions[idB] = this.collisions[idB] || [];
      this.collisions[idB].push({id: idA, impulse: impulse});
    }
  });

});