'use strict';

const Hapi = require('hapi');
const Wreck = require('wreck');
const async = require('async');
const _ = require('lodash');
const strman = require('strman');

let wreck = Wreck.defaults({
    baseUrl: 'https://www.lowes.com',
    json: "force"
});

const server = new Hapi.Server();
server.connection({ port: 3000 });

server.register(require('vision'), (err) => {
    server.views({
	    engines: {
	        hbs: require('handlebars')
	    },
	    relativeTo: __dirname,
	    path: 'views'
	});

	server.route({
	    method: 'GET',
	    path: '/',
	    handler: function (request, reply) {
	        reply.view('index');
	    }
	});

	server.route({
	    method: 'GET',
	    path: '/lookup/{productId}/store/{storeNumber}',
	    handler: function (request, reply) {
	    	let storeNumber = request.params.storeNumber;
	    	let productId = request.params.productId;

	    	async.waterfall([
			    function(callback) {
			    	let storeNumbers = [];
			    	let stores = {};

			        return wreck.get('/wcs/resources/store/10151/storelocation/storeNumber/'+storeNumber+'/v1_0?maxResults=25', function(err, res, payload) {
			        	if (!err) {
			        		_.forEach(payload.storeLocation, function(location){
			        			let normalizedStoreNumber = strman.leftPad(location.storeNumber.toString(), 4, '0');
			        			storeNumbers.push(normalizedStoreNumber);
			        			stores[normalizedStoreNumber] = location;
			        		});
			    			callback(null, storeNumbers.join(","), stores);
			    		} else {
			    			callback(err);
			    		}
	    			});
			    },
			    function(storeNumbers, stores, callback) {
			    	return wreck.get('/PricingServices/price/balance?productId='+productId+'&storeNumber='+storeNumbers, function (err, res, payload) {
			    		if (!err) {
			    			let lowestPrice = parseFloat(payload[0].price.selling);
			    			let lowestPriceIndex = 0;

			    			let noramalizedResult = _.forEach(payload, function(storePrice, index){
			    				var sellingPrice = parseFloat(storePrice.price.selling);
			    				if (sellingPrice < lowestPrice) {
			    					lowestPrice = sellingPrice;
			    					lowestPriceIndex = index;
			    				}
			    				return _.forEach(storePrice.availability, function(availability) {
			    					if (availability.deliveryMethodName === "Store Pickup") {
			    						let normalizedStoreNumber = strman.leftPad(availability.storeNumber.toString(), 4, '0');
			    						storePrice.storeNumber = normalizedStoreNumber;
			    						storePrice.storeName = stores[normalizedStoreNumber].storeName;
			    						storePrice.onHand = availability.availabileQuantity;
			    						storePrice.milesToStore = parseFloat(stores[normalizedStoreNumber].milesToStore);
			    					}
			    				});
			        		});
			        		noramalizedResult[lowestPriceIndex].lowestPrice = true;
			        		noramalizedResult = _.sortBy(noramalizedResult, "milesToStore");
			        		if (lowestPrice === parseFloat(noramalizedResult[0].price.selling)) {
			        			_.forEach(noramalizedResult, function(storePrice, index){
			        				if (storePrice.lowestPrice) {
			        					lowestPriceIndex = index;
			        				}
			        			});
			        			delete noramalizedResult[lowestPriceIndex].lowestPrice;
			        			noramalizedResult[0].lowestPrice = true;
			        		}
			    			callback(null, {
			    				storePrices: noramalizedResult
			    			});
			    		} else {
			    			callback(err);
			    		}
					});
			    }
			], function (err, result) {
				if (!err) {
					reply.view('prices', result);
				} else {
					console.log(err);
					reply(err);
				}
			});
	    }
	});

	server.start((err) => {
	    if (err) {
	        throw err;
	    }
	    console.log('Server running at:', server.info.uri);
	});
});
