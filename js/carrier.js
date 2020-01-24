state = (function() {

//
// fine tuning
//
var seed = 27;
var seeder = function() {
    var sd = seed;
    return function() {
        sd = Math.sin(sd) * 10001;
        return sd - Math.floor(sd);
    }
}
                
var env = {
    players: 4,
    idleTime: 45,
    swarming: true,
    // width: calculated
    // height: calculated
    minPlanets: 12,
    maxPlanets: 44,
    planets: 44,
    planetSpacing: 50,
    edge: 60,
    mpg: 10,
    scope: 0.2,
    maxConnections: 3,
    connectionSpacing: 20,
    maxConnectionLength: 300,
    mineRate: 0.02,
    productionRate: 0.004,
    productionFuel: 8,
    stockpileCapacity: 120,
    orbitalCapacity: 20,

    galaxyBackground: '#001020',

    initFuel: 80,
    initDrones: 40,
    speed: 40,
    attackSpeed: 1,
    siphonSpeed: 8,
    dockSpeed: 1,

    homePlanetDrones: 5,
    homePlanetFuel: 20,

    random: seeder(),
}

var Sattelite = function() {
    this.time = 0;
    this.x = 0;
    this.y = 0;
    this.dx = 0;
    this.dy = 0;

    this.distance = function() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
}

var Planet = function(x, y, type) {
    this.discovered = false;
    this.x = x;
    this.y = y;
    this.type = type;
    this.radius = 15;
    this.team = -1;
    this.drones = 0;
    this.fuel = 0;
    this.mineRate = env.mineRate;
    this.mineTime = 0;
    this.productionRate = env.productionRate;
    this.productionTime = 0;
    this.productionFuel = env.productionFuel;
    this.stockpileCapacity = env.stockpileCapacity;
    this.orbitalCapacity = env.orbitalCapacity;
    if (type === 0) {
        this.stockpileCapacity = this.stockpileCapacity * 2;
        this.orbitalCapacity = this.orbitalCapacity * 2;
    }
    this.connectedPlanets = [];
    this.swarm = [];
    this.swarmTime = 0;

    this.update = function(d) {
        if (this.drones <= 0) {
            this.drones = 0;
            this.team = -1;
        } else {
            if (this.type === 1) {
                // produce
                var fuel = this.productionRate * d * this.drones * this.productionFuel;
                if (this.fuel > fuel && this.drones < this.orbitalCapacity) {
                    this.fuel -= fuel;
                    this.productionTime += this.productionRate * d * this.drones;
                    if (this.productionTime > 1) {
                        this.drones++;
                        this.productionTime = 0;
                        // TODO new drone SFX
                    }
                }
                
            } else if (this.type === 2) {
                // mine
                this.mineTime += this.mineRate * d * this.drones;
                if (this.mineTime > 1 && this.fuel < this.stockpileCapacity) {
                    this.fuel++;
                    this.mineTime = 0;
                }
            }
        }

        if (env.swarming) {
            // update swarm
            this.swarmTime -= d;
            if (this.drones < this.swarm.length) this.swarm.pop();
            else if (this.drones > this.swarm.length && this.swarmTime <= 0) {
                this.swarm.push(new Sattelite());
                this.swarmTime = env.dockSpeed;
            }

            for (var s = 0; s < this.swarm.length; s++) {
                var sat = this.swarm[s];
                sat.time -= d;
                if (sat.time <= 0) {
                   if (sat.distance() > 5) {
                       sat.time = 4 + Math.random() * 22;
                       sat.dx = -sat.x / sat.time;
                       sat.dy = -sat.y / sat.time;
                   } else {
                        sat.time = 4 + Math.random() * 2;
                        sat.dx = (Math.random() - 0.5) * 15;
                        sat.dy = (Math.random() - 0.5) * 15;
                   }
                } else {
                    sat.x += sat.dx * d;
                    sat.y += sat.dy * d;
                }
            }
        }
    }

    this.color = function() {
        if (this.team < 0) return '#A0A0A0';
        return scene.carrier[this.team].color;
    }

    this.render = function(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, 2 * Math.PI, false);
        ctx.fillStyle = '0xA0A0A0';
        if (this.discovered) {
            switch(this.type) {
                case 1: ctx.fillStyle = '#4B1E63'; break;
                case 2: ctx.fillStyle = '#056934'; break;
                default: ctx.fillStyle = '#246DB4';
            }
        }
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.color();
        ctx.stroke();

        // tags
        ctx.fillStyle = 'yellow';
        ctx.font = '10px monospace';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText('' + Math.floor(this.drones) + '/' + Math.floor(this.fuel), 0, 0);
        ctx.restore();
    }

    this.sqr = function(x) { return x * x; }

    this.dist2 = function(v, w) { return this.sqr(v.x - w.x) + this.sqr(v.y - w.y); }

    this.distToSegmentSquared = function(p, v, w) {
        var l2 = this.dist2(v, w);
        if (l2 == 0) return this.dist2(p, v);
        var t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        if (t < 0) return this.dist2(p, v);
        if (t > 1) return this.dist2(p, w);
        return this.dist2(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
    }

    this.distToSegment = function(p, v, w) { return Math.sqrt(this.distToSegmentSquared(p, v, w)); }

    this.testPath = function(o, d) {
        for (var i = 0; i < scene.planet.length; i++) {
        if (o.index !== i && d.index !== i && this.distToSegment(scene.planet[i], o, d) < env.connectionSpacing) {
            return false;
        }
    }
    return true;
}

this.distance = function(x, y) {
    return Math.sqrt(Math.pow(this.x - x, 2) + Math.pow(this.y - y, 2));
}

}

var Carrier = function(team, x, y) {
    this.dead = false;
    this.AI = false;
    this.lastActivity = Date.now();
    this.localStatus = '';
    this.globalStatus = '';
    this.team = team;
    this.parked = false;
    this.connection = false;
    this.x = x;
    this.y = y;
    this.tx = x;
    this.ty = y;
    this.drones = env.initDrones;
    this.droneCapacity = env.initDrones;
    this.fuel = env.initFuel;
    this.fuelCapacity = env.initFuel;
    this.mpg = env.mpg;
    this.scope = env.scope;
    this.maxConnectionLength = env.maxConnectionLength;
    this.closePlanet = [];
    this.closeIndex = 0;
    this.speed = env.speed;
    this.attackSpeed = env.attackSpeed;
    this.siphonSpeed = env.siphonSpeed;
    this.dockSpeed = env.dockSpeed;
    this.siphon = 0;
    this.siphonTime = 0;
    this.loading = 0;
    this.loadingTime = 0;
    this.attackTime = 0;
    this.jumpControl = Math.random() * 10;

    this.setColor = function() {
        switch(this.team) {
            case 0: this.color = '#50B0FF';
                    this.r = 0x50;
                    this.g = 0xB0;
                    this.b = 0xFF;
                    break;
            case 1: this.color = '#FF0000';
                    this.r = 0xFF;
                    this.g = 0x00;
                    this.b = 0x00;
                    break;
            case 2: this.color = '#00FF00';
                    this.r = 0x00;
                    this.g = 0xFF;
                    this.b = 0x00;
                    break;
            case 3: this.color = '#FCB900';
                    this.r = 0xFC;
                    this.g = 0xB9;
                    this.b = 0x00;
                    break;
            default: this.color = '#AAAAAA';
                     this.r = 0xAA;
                     this.g = 0xAA;
                     this.b = 0xAA;
        }
    }
    this.setColor();

    this.control = function(d) {
        if (!this.AI) return;
        if (!this.parked) return;

        // failsafe jumper
        this.jumpControl -= d;
        if (this.jumpControl < 0) {
            // waiting too long - have to jump
            this.controlJump();
            return;
        }

        if (this.parked.team < 0) {
            // neutral - capture
            if (this.drones > 1) this.loading = -1;
        } else if (this.parked.team === this.team) {
            // friendly

            if (this.parked.type === 1) {
                // production activities

                // drop some fuel
                if (this.fuel > this.fuelCapacity * 0.4) {
                    this.siphon = -1;
                } else {
                    this.siphon = 0;
                }
                
                // get some drones
                if (this.parked.drones > 10) {
                    this.loading = 1;
                } else if (this.drones > this.droneCapacity / 2) {
                    this.loading = -1;
                } else {
                    this.loading = 0;
                }

            } else if (this.parked.type === 2) {
                    // mining activities
                    if (this.drones < this.droneCapacity * 0.2 && this.parked.drones > 2) {
                        this.loading = 1;
                    } else if (this.drones > this.droneCapacity * 0.25) {
                        this.loading = -1;
                    } else {
                        this.loading = 0;
                    }
                    if (this.fuel < this.fuelCapacity) {
                        this.siphon = 1;
                    }
            } else {
                    // stockpiling activities
                    if (this.drones > this.droneCapacity * 0.8) this.loading = -1;
                    else if (this.drones < this.droneCapacity * 0.25 && this.parked.drones > 1) this.loading = 1;
                    else this.loading = 0;

                    if (this.fuel > this.fuelCapacity * 0.9) this.siphon = -1;
                    else if (this.fuel < this.fuelCapacity * 0.5 && this.parked.fuel > 1) this.siphon = 1;
                    else this.siphon = 0;
            }
        } else {
            // enemy planet
            if (this.parked.drones + 1 >= this.drones || this.drones < 2) {
                // losing the battle - have to run!
                this.controlJump();
                return;
            } else {
                // idle for the victory
                this.jumpControl += d;
            }
        }
    }

    this.controlJump = function() {
        var n = Math.random() * 3 + 1;
        for (var i = 0; i < n; i++) this.plantConnection();
        
        if (this.jump()) {
            this.siphon = 0;
            this.loading = 0;
            this.jumpControl = 10 + Math.random() * 20;
        }
    }

    this.park = function(planet) {
        this.parked = planet;
        this.parked.discovered = true;
        this.x = planet.x;
        this.y = planet.y;
        this.x += 30;
        this.y += (team - 1.5) * 15;
    }

    this.kill = function() {
        if (!this.parked) return false;
        if (this.parked.team === this.team || this.parked.team < 0) return false;
        if (this.parked.drones < 1) return false; // nobody to kill
        if (this.drones < 1) {
            this.dead = true; // ooops... we are dead now - the carrier has blowed up
            // TODO some SFX would be nice :)
        } else {
            this.drones--;
            this.parked.drones--;
            // TODO clash SFX
        }
    }

    this.refuel = function(amount) {
        this.fuel += amount;
        if (this.fuel <= this.fuelCapacity) return amount;
        amount = amount - (this.fuel - this.fuelCapacity);
        this.fuel = this.fuelCapacity;
        return amount;
    }
    this.burnFuel = function(amount) {
        this.fuel -= amount;
        if (this.fuel >= 0) return amount;
        amount = amount + this.fuel;
        this.fuel = 0;
        return amount;
    }

    this.refuelOne = function() {
        if (!this.parked) return false;
        if (this.parked.team !== this.team) return false;
        if (this.parked.fuel >= 1 && this.fuel < this.fuelCapacity) {
            this.parked.fuel--;
            this.fuel++;
        } else {
            return false;
        }
    }

    this.stockpileOne = function() {
        if (!this.parked) return false;
        if (this.parked.team !== this.team) return false;
        if (this.fuel < 1 || this.parked.fuel >= this.parked.stockpileCapacity) return false;
        this.fuel--;
        this.parked.fuel++;
        return true;
    }

    this.dock = function() {
        if (!this.parked) return false;
        if (this.parked.team !== this.team) return false;
        if (this.parked.drones >= 1 && this.drones < this.droneCapacity) {
            this.parked.drones--;
            this.drones++;
            return true;
        } else {
            return false;
        }
    }
    this.launch = function() {
        if (!this.parked) return false;
        if (this.parked.team !== this.team) return false;
        if (this.drones < 1 || this.parked.drones >= this.parked.orbitalCapacity) return false;
        this.drones--;
        this.parked.drones++;
        return true;
    }

    this.jump = function() {
        if (this.dead) return false;
        if (this.parked && this.connection) {
            if (this.connection.length / this.mpg > this.fuel) return false;
            this.burnFuel(this.connection.length / this.mpg);
            this.establishConnection();
            this.x = this.parked.x;
            this.y = this.parked.y;
            this.tx = this.connection.destination.x;
            this.ty = this.connection.destination.y;
            var len = this.distance(this.x, this.y, this.tx, this.ty);
            this.dx = (this.tx - this.x) / len;
            this.dy = (this.ty - this.y) / len;
            this.transferTime = len / this.speed;
            this.target = this.connection.destination;
            this.parked = false;
            this.connection = false;
            return true;
        }
    }

    this.establishConnection = function() {
        if (!this.connection.isPlanted()) {
            scene.connection.push(this.connection);
            this.connection.established = true;
            this.connection.destination.connectedPlanets.push(this.connection.origin);
            this.connection.origin.connectedPlanets.push(this.connection.destination);
        }
    }


    this.statTime = 0;
    this.update = function(d) {
        if (this.dead) {
            this.localStatus = '< eliminated!';
            //this.globalStatus = '';
            return;
        }
        if ((Date.now() - this.lastActivity) / 1000 > env.idleTime) this.AI = true;

        this.statTime += d;
        if (this.statTime > 1) {
            var planets = 0;
            var drones = this.drones;
            var fuel = this.fuel;
            for (var y = 0; y < scene.planet.length; y++) {
                if (scene.planet[y].team === this.team) {
                    planets++;
                    drones += scene.planet[y].drones;
                    fuel += scene.planet[y].fuel;
                }
            }
            this.globalStatus = 'planets: ' + planets + ' drones: ' + Math.floor(drones) + ' fuel: ' + Math.floor(fuel);
            this.statTime = 0;
        }

        if (!this.parked) {
            this.localStatus = 'on the move';
            this.x += this.dx * this.speed * d;
            this.y += this.dy * this.speed * d;
            this.transferTime -= d;
            if (this.distance(this.x, this.y, this.tx, this.ty) < 20 || this.transferTime <= 0) {
                // arrived
                this.park(this.target);
                this.target = null;
            }
        } else {
            // parked in orbit - scope, dock/launch, refuel/stockpile and battle

            // scope
            this.refuel(this.scope * d);

            // owned planet
            if (this.parked.team === this.team) {
                if (this.parked.type === 1) {
                    this.localStatus = 'in orbit @factory planet';
                    if (this.parked.drones < 1) this.localStatus = 'in orbit @factory planet - deploy more drones to speed up production';
                    else if (this.parked.fuel < 1) this.localStatus = 'in orbit @factory planet - needs fuel to produce';
                } else if (this.parked.type === 2) {
                    this.localStatus = 'in orbit @mine planet';
                    if (this.parked.drones < 1) this.localStatus = 'in orbit @mine planet - deploy more drones to speed up mining';
                } else {
                    this.localStatus = 'in orbit @stockpile planet';
                }

                if (this.siphon < 0) {
                    this.siphonTime += this.siphonSpeed * d;
                    if (this.siphonTime >= 1) {
                        this.stockpileOne();
                        this.siphonTime = 0;
                    }
                } else if (this.siphon > 0) {
                    this.siphonTime += this.siphonSpeed * d;
                    if (this.siphonTime >= 1) {
                        this.refuelOne();
                        this.siphonTime = 0;
                    }
                }
                if (this.loading < 0) {
                    this.loadingTime += this.dockSpeed * d;
                    if (this.loadingTime >= 1) {
                        this.launch();
                        this.loadingTime = 0;
                    }
                } else if (this.loading > 0) {
                    this.loadingTime += this.dockSpeed * d;
                    if (this.loadingTime >= 1) {
                        this.dock();
                        this.loadingTime = 0;
                    }
                }
            } else {
                if (this.parked.team < 0) {
                    // neutral
                    this.localStatus = 'in orbit @neutral planet - launch drones to capture';
                    
                    if (this.loading < 0) {
                        this.loadingTime += this.dockSpeed * d;
                        if (this.loadingTime >= 2) {
                            // planet is captured!
                            this.parked.team = this.team;
                            this.launch();
                            this.loadingTime = 0;
                            // TODO capture planet SFX
                        }
                    }
                } else {
                    // enemy planet - battle in progress
                    this.localStatus = 'in orbit @enemy planet - battle in progress...';
                    if (this.parked.drones > this.drones) {
                        this.localStatus = "in orbit @enemy planet - you're losing! RETREAT!";
                    }
                    this.attackTime += this.attackSpeed * d;
                    if (this.attackTime > 1) {
                        this.kill();
                        this.attackTime = 0;
                    }
                }
            }
        }

        if (this.AI) this.localStatus = '>>> ' + this.localStatus;
        else this.localStatus = '> ' + this.localStatus;
    }

    this.distance = function(x1, y1, x2, y2) {
        return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
    }
    
    this.findReachablePlanets = function() {
        this.closePlanet = [];
        if (!this.parked) return false;
        if (this.parked.connectedPlanets.length >= env.maxConnections) {
            this.closePlanet = this.parked.connectedPlanets;
            return;
        }
        for (var i = 0; i < scene.planet.length; i++) {
            if (this.parked.index != i && this.parked.distance(scene.planet[i].x, scene.planet[i].y) < this.maxConnectionLength) {
                if (this.parked.testPath(this.parked, scene.planet[i])) {
                    this.closePlanet.push(scene.planet[i]);
                }
            }
        }
    }

    this.plantConnection = function() {
        if (this.dead) return;
        if (this.parked) {
            var nextPlanet = this.nextPlanet();
            if (nextPlanet == null) this.connection = false;
            else this.connection = new Connection(this.parked, nextPlanet, this.color, this.fuel * this.mpg);
        }
    }
    this.nextPlanet = function() {
        this.findReachablePlanets();
        if (this.closePlanet.length === 0) return null;
        if (this.closeIndex >= this.closePlanet.length) {
            this.closeIndex = 0;
            return null;
        }
        return this.closePlanet[this.closeIndex++];
    }

    this.render = function(ctx) {
        if (this.dead) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.fillStyle = this.color;
        ctx.fillRect(-10, -5, 20, 10);
        // tags
        ctx.fillStyle = this.color;
        ctx.font = '12px monospace';
        ctx.textBaseline = 'bottom';
        var fuelCost = '';
        if (this.connection && !this.AI) fuelCost = '[-' + Math.round(this.connection.length / this.mpg) + ']';
        ctx.fillText('' + Math.round(this.drones) + '/' + Math.round(this.fuel) + fuelCost, 5, -8);
        ctx.restore();
    }
}

var Connection = function(origin, destination, color, reachableDistance) {
    this.origin= origin;
    this.destination= destination;
    this.color = color;
    this.length = origin.distance(destination.x, destination.y);
    if (reachableDistance >= this.length) this.reachable = true;
    else this.reachable = false;
    this.established = false; 

    this.isPlanted = function() {
        for (var i = 0; i < scene.connection.length; i++) {
            if (this.match(scene.connection[i])) return true;
        }
        return false;
    }

    this.match = function(connection) {
        if (this.origin.index === connection.origin.index && this.destination.index === connection.destination.index) return true;
        if (this.origin.index === connection.destination.index && this.destination.index === connection.origin.index) return true;
        return false;
    }

    this.render = function(ctx) {
        ctx.beginPath();
        if (this.established) {
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#FFBF00';
        } else { 
            ctx.lineWidth = 3;
            if (this.reachable) {
                ctx.strokeStyle = this.color;
            } else {
                ctx.strokeStyle = '#808080';
            }
        }
        ctx.moveTo(this.origin.x, this.origin.y);
        ctx.lineTo(this.destination.x, this.destination.y);
        ctx.closePath();
        ctx.stroke();
    }
}

//
// game state
//
var scene = {
    time: 0,
    lastFrame: Date.now(),
    status: '',

    planet: [],
    carrier: [],
    connection: [],

    generateGalaxy: function() {

        var testSpacing = function(x, y, spacing) {
            for (var p = 0; p < scene.planet.length; p++) {
                if (scene.planet[p].distance(x, y) < spacing) return false;
            }
            return true;
        }
        var createPlanet = function() {
            var p = false;
            while (p === false) {
                var f = env.random();
                var type = 0; // stockpile planet
                if (f < 0.2) type = 1; // factory planet
                else if (f < 0.7) type = 2; // mine planet 
                p = new Planet( env.edge + env.random() * (env.width - 2 * env.edge), env.edge + env.random() * (env.height - 3 * env.edge), type );
                if (!testSpacing(p.x, p.y, env.planetSpacing)) p = false;
            }
            p.index = scene.planet.length;
            scene.planet.push(p);
        }

        scene.planet = [];
        scene.connection = [];
        env.planets = Math.floor(env.minPlanets + env.random() * (env.maxPlanets - env.minPlanets))
        for (var i = 0; i < env.planets; i++) {
            createPlanet();
        }
    },

    deployCarriers: function() {
        scene.carrier = [];
        for (var i = 0; i < env.players; i++) {
            var carrier = new Carrier(i, Math.random() * env.width, Math.random() * env.height);
            switch(i) {
                case 0: carrier.park(scene.findEdgePlanet(-1, -1));
                        carrier.parked.discovered = true;
                        carrier.parked.team = 0;
                        carrier.parked.drones = env.homePlanetDrones;
                        carrier.parked.fuel = env.homePlanetFuel;
                        break;
                case 1: carrier.park(scene.findEdgePlanet(1, -1));
                        carrier.parked.discovered = true;
                        carrier.parked.team = 1;
                        carrier.parked.drones = env.homePlanetDrones;
                        carrier.parked.fuel = env.homePlanetFuel;
                        break;
                case 2: carrier.park(scene.findEdgePlanet(-1, 1));
                        carrier.parked.discovered = true;
                        carrier.parked.team = 2;
                        carrier.parked.drones = env.homePlanetDrones;
                        carrier.parked.fuel = env.homePlanetFuel;
                        break;
                case 3: carrier.park(scene.findEdgePlanet(1, 1));
                        carrier.parked.discovered = true;
                        carrier.parked.team = 3;
                        carrier.parked.drones = env.homePlanetDrones;
                        carrier.parked.fuel = env.homePlanetFuel;
                        break;
                default: carrier.park(scene.findEdgePlanet(0, 0));
            }
            scene.carrier.push(carrier);
        }
    },

    // fx and fy should be -1..1 to indicate the quadrant
    findEdgePlanet: function(fx, fy) {
        var planet = scene.planet[0];
        var distance = 99999999;
        fx = (fx / 2 + 0.5) * env.width;
        fy = (fy / 2 + 0.5) * env.height;
        for (var i = 0; i < scene.planet.length; i++) {
            var d = scene.planet[i].distance(fx, fy);
            if (d < distance) {
                planet = scene.planet[i];
                distance = d;
            }
        }
        return planet;
    },

}

function init() {
    var canvas = document.getElementById("canvas");
    env.width = canvas.width;
    env.height = canvas.height;
    
    start();
    setInterval(loop, 33);
}


function start() {
    scene.generateGalaxy();
    scene.deployCarriers();
}

function loop() {
    var now = Date.now();
    var delta = (now - scene.lastFrame) / 1000;

    handle(delta);
    update(delta);
    render(delta);
    scene.lastFrame = now;
}

function update(d) {
    scene.time += d;
    scene.status = "galactic day: " + Math.floor(scene.time / 12 + 1);

    for (var p = 0; p < scene.planet.length; p++) {
        scene.planet[p].update(d);
    }

    for (var c = 0; c < scene.carrier.length; c++) {
        scene.carrier[c].update(d);
    }
}

function render(d) {
    var c = document.getElementById("canvas")
    var ctx = c.getContext("2d")
    
    // clear
    ctx.fillStyle = env.galaxyBackground;
    ctx.fillRect(0,0,c.width,c.height);
    
    if (env.swarming) {
        // swarm
        var canvasData = ctx.getImageData(0, 0, env.width, env.height);

        function pixel (x, y, r, g, b, a) {
            var index = (x + y * env.width) * 4;
            canvasData.data[index++] = r;
            canvasData.data[index++] = g;
            canvasData.data[index++] = b;
            canvasData.data[index] = a;
        }

        for (var p = 0; p < scene.planet.length; p++) {
            var planet = scene.planet[p];
            if (planet.team >= 0) {
                var rv = scene.carrier[planet.team].r;
                var gv = scene.carrier[planet.team].g;
                var bv = scene.carrier[planet.team].b;

                for (var s = 0; s < planet.swarm.length; s++) {
                    var sx = Math.round(planet.x + planet.swarm[s].x);
                    var sy = Math.round(planet.y + planet.swarm[s].y);
                    pixel(sx++, sy, rv, gv, bv, 255);
                    pixel(sx, sy++, rv, gv, bv, 255);
                    pixel(sx--, sy, rv, gv, bv, 255);
                    pixel(sx, sy, rv, gv, bv, 255);
                }
            }
        }
        ctx.putImageData(canvasData, 0, 0);
    }
         
    
    // connections
    ctx.save();
    for (var l = 0; l < scene.connection.length; l++) {
        scene.connection[l].render(ctx);
    }
    // carrier connections
    for (var cl = 0; cl < scene.carrier.length; cl++) {
        if (scene.carrier[cl].connection && !scene.carrier[cl].AI && !scene.carrier[cl].dead) {
            scene.carrier[cl].connection.render(ctx);
        }
    }
    ctx.restore();

    // planets
    for (var i = 0; i < scene.planet.length; i++) {
        scene.planet[i].render(ctx);
    }

    // carriers
    for (var c = 0; c < scene.carrier.length; c++) {
        scene.carrier[c].render(ctx);
    } 

    // status
    scene.status;
    ctx.fillStyle = "#FFFF00";
    ctx.font = '18px monospace';
    ctx.textBaseline = 'bottom';
    ctx.fillText(scene.status, 10, 25);

    ctx.save();
    // carrier status
    var y = env.height - env.edge;
    for (var i = 0; i < scene.carrier.length; i++) {
        ctx.fillStyle = scene.carrier[i].color;
        ctx.font = '16px monospace';
        ctx.textBaseline = 'bottom';
        ctx.fillText(scene.carrier[i].localStatus, 20, y);
        ctx.fillText(scene.carrier[i].globalStatus, 600, y);
        y += 15;
    }
    ctx.restore();
}

// process keyboard input
function handle(d) {
    // reset
    if (27 in keysUp) {
        if (scene.lastEscape && scene.lastEscape + 2000 > Date.now()) {
            // reset the world
            seed += 1;
            env.random = seeder();
            start();
        } else {
            scene.lastEscape = Date.now();
        }
    }
    // details
    if (90 in keysUp) {
        env.swarming = !env.swarming;
    }
    
    // AI
    for (var i = 0; i < scene.carrier.length; i++) {
        scene.carrier[i].control(d);
    }

    // player 1
    if (69 in keysDown || 82 in keysDown || 87 in keysDown
            || 83 in keysDown || 65 in keysDown || 68 in keysDown) {
        scene.carrier[0].AI = false;
        scene.carrier[0].lastActivity = Date.now();
    }
    if (69 in keysDown) { scene.carrier[0].plantConnection(); };
    if (82 in keysDown) { scene.carrier[0].jump(); };
    if (87 in keysDown) { scene.carrier[0].siphon = 1; };
    if (83 in keysDown) { scene.carrier[0].siphon = -1; };
    if (87 in keysUp || 83 in keysUp) { scene.carrier[0].siphon = 0; scene.carrier[0].siphonTime = 0; };
    if (65 in keysDown) { scene.carrier[0].loading = -1; };
    if (68 in keysDown) { scene.carrier[0].loading = 1; };
    if (65 in keysUp || 68 in keysUp) { scene.carrier[0].loading = 0; scene.carrier[0].loadingTime = 0; };
    
    // player 2 - link, jump, take/drop fuel, take/drop drone
    if (191 in keysDown || 190 in keysDown || 18 in keysDown || 55 in keysDown
            || 16 in keysDown || 188 in keysDown || 13 in keysDown || 56 in keysDown
            || 38 in keysDown || 54 in keysDown
            || 40 in keysDown || 89 in keysDown
            || 39 in keysDown || 85 in keysDown
            || 37 in keysDown || 84 in keysDown) {
        scene.carrier[1].AI = false;
        scene.carrier[1].lastActivity = Date.now();
    }
    if (191 in keysDown || 190 in keysDown || 18 in keysDown || 55 in keysDown) { scene.carrier[1].plantConnection(); }
    if (16 in keysDown || 188 in keysDown || 13 in keysDown || 56 in keysDown) { scene.carrier[1].jump(); }
    if (38 in keysDown || 54 in keysDown) { scene.carrier[1].siphon = 1; };
    if (40 in keysDown || 89 in keysDown) { scene.carrier[1].siphon = -1; };
    if (38 in keysUp || 40 in keysUp || 54 in keysUp || 89 in keysUp) { scene.carrier[1].siphon = 0; scene.carrier[1].siphonTime = 0; };
    if (39 in keysDown || 85 in keysDown) { scene.carrier[1].loading = 1; }
    if (37 in keysDown || 84 in keysDown) { scene.carrier[1].loading = -1; };
    if (39 in keysUp || 37 in keysUp || 85 in keysUp || 84 in keysUp) { scene.carrier[1].loading = 0; scene.carrier[1].loadingTime = 0; };


    // player 3
    if (74 in keysDown || 75 in keysDown || 72 in keysDown
            || 78 in keysDown || 66 in keysDown || 77 in keysDown) {
        scene.carrier[2].AI = false;
        scene.carrier[2].lastActivity = Date.now();
    }
    if (74 in keysDown) { scene.carrier[2].plantConnection(); };
    if (75 in keysDown) { scene.carrier[2].jump(); };
    if (72 in keysDown) { scene.carrier[2].siphon = 1; };
    if (78 in keysDown) { scene.carrier[2].siphon = -1; };
    if (72 in keysUp || 78 in keysUp) { scene.carrier[2].siphon = 0; scene.carrier[2].siphonTime = 0; };
    if (66 in keysDown) { scene.carrier[2].loading = -1; };
    if (77 in keysDown) { scene.carrier[2].loading = 1; };
    if (66 in keysUp || 77 in keysUp) { scene.carrier[2].loading = 0; scene.carrier[2].loadingTime = 0; };

    // player 4
    if (189 in keysDown || 163 in keysDown || 57 in keysDown
            || 187 in keysDown || 71 in keysDown || 56 in keysDown
            || 48 in keysDown || 80 in keysDown || 79 in keysDown || 219 in keysDown) {
        scene.carrier[3].AI = false;
        scene.carrier[3].lastActivity = Date.now();
    }
    if (189 in keysDown || 163 in keysDown || 57 in keysDown) { scene.carrier[3].plantConnection(); };
    if (187 in keysDown || 71 in keysDown || 56 in keysDown) { scene.carrier[3].jump(); };
    if (48 in keysDown) { scene.carrier[3].siphon = 1; };
    if (80 in keysDown) { scene.carrier[3].siphon = -1; };
    if (48 in keysUp || 80 in keysUp) { scene.carrier[3].siphon = 0; scene.carrier[3].siphonTime = 0; };
    if (219 in keysDown) { scene.carrier[3].loading = 1; };
    if (79 in keysDown) { scene.carrier[3].loading = -1; };
    if (219 in keysUp || 79 in keysUp) { scene.carrier[3].loading = 0; scene.carrier[3].loadingTime = 0; };

    keysDown = [];
    keysUp = [];
}

// catch keyboards events
var keysDown = {};
var keysUp = {};

addEventListener("keydown", function (e) {
       keysDown[e.keyCode] = true;
}, false);
addEventListener("keyup", function(e) {
    keysUp[e.keyCode] = true;
}, false);


window.onload = init;

return {
    env: env,
    scene: scene,
}

})()
