/**
 * @depends {nrs.js}
 */
var NRS = (function(NRS, $, undefined) {
    var contacts = [];

    var sortByAggregatedIncomeAmount = function(a, b) {
        var x = a.aggregated.transactedAmountNQT;
        var y = b.aggregated.transactedAmountNQT;
        return ((x < y) ? -1 : ((x > y) ? 1 : 0));
    };

    var findIndexOfSender = function(array, senderRS) {
        for (i = 0; i < array.length; i++) {
            if (array[i].senderRS === senderRS)
                return i;
        }
        return null;
    };

    var getAsset = function(id, cb) {
        NRS.sendRequest("getAsset+", {
            "asset": id.toString()
        }, function(asset, input) {
            cb(asset);
        });
    };

    var getAssetBidPrice = function(id, cb) {
        NRS.sendRequest("getBidOrders+", {
            "asset": id.toString(),
            "firstIndex": 0,
            "lastIndex": 0
        }, function(response, input) {
            if (response.bidOrders.length > 0)
                cb(response.bidOrders[0]);
            else
                cb(null);
        });
    };

    var drawChart = function(name, title, contentData, size) {
        // first we empty any remaining pie
        $('#' + name).empty();

        var pie = new d3pie(name, {
            "header": {
                "title": {
                    "text": title,
                    "fontSize": 22,
                    "font": "verdana"
                },
                "subtitle": {
                    "text": "",
                    "color": "#999999",
                    "fontSize": 10,
                    "font": "verdana"
                },
                "titleSubtitlePadding": 12
            },
            // "footer": {
            //     "text": "",
            //     "color": "#999999",
            //     "fontSize": 11,
            //     "font": "open sans",
            //     "location": "bottom-center"
            // },
            "size": size || {
                "canvasHeight": 400,
                "canvasWidth": 600,
                "pieOuterRadius": "80%"
            },
            data: {
                "sortOrder": "value-desc",
                "smallSegmentGrouping": {
                    "enabled": true,
                    "value": 1
                },
                content: contentData
            },
            "labels": {
                "outer": {
                    "pieDistance": 32
                },
                "inner": {
                    "string": "{percentage}%"
                },
                "mainLabel": {
                    "font": "verdana"
                },
                "percentage": {
                    "color": "#e1e1e1",
                    "font": "verdana",
                    "decimalPlaces": 0
                },
                "value": {
                    "color": "#e1e1e1",
                    "font": "verdana"
                },
                "lines": {
                    "enabled": true,
                    "color": "#cccccc"
                },
                "truncation": {
                    "enabled": true
                }
            },
            "tooltips": {
                "enabled": true,
                "type": "placeholder",
                "string": "{value} NXT"
            } //,
            // "effects": {
            //     "pullOutSegmentOnClick": {
            //         "effect": "linear",
            //         "speed": 400,
            //         "size": 8
            //     }
            // }
        });
    };

    var draw = function(dataContent) {
        if (dataContent.length === NRS.accountInfo.assetBalances.length) {
            $('#my_assets_page>.content').prepend('<div id="insertedAssetDistributionChart"></div>');
            drawChart('assetDistributionChart', 'Asset Distribution', dataContent);
            NRS.dataLoaded();
        } else {
            //console.log('Need more data to draw', dataContent.length, NRS.accountInfo.assetBalances.length);
        }
    };

    NRS.setup.p_dividends_scanner = function() {
        //console.info('NRS.setup.p_dividends_scanner');
        //Do one-time initialization stuff here
        $('#p_dividends_scanner_startup_date_time').html(moment().format('LLL'));

        // Here we looks for the users contact in order to display there
        // name when available
        var rq = window.indexedDB.open("NRS_USER_DB_" + NRS.accountInfo.account, 2);

        rq.onerror = function(event) {
            alert('Error with IndexedDB: ' + event);
        };

        rq.onsuccess = function(event) {
            db = event.target.result;

            var objectStore = db.transaction("contacts").objectStore("contacts");
            objectStore.openCursor().onsuccess = function(event) {
                var cursor = event.target.result;

                if (cursor) {
                    contacts.push(cursor.value);
                    cursor.continue();
                } else {
                    console.debug("Got all contacts: " + contacts.length);
                }
            };
        };
    };

    NRS.pages.p_dividends_scanner = function() {
        var rows = "";
        var dataContent = [];

        // Asset distribution
        $.each(NRS.accountInfo.assetBalances, function(field, obj) {
            //console.log(obj.asset, obj.balanceQNT);
            getAsset(obj.asset, function(asset) {
                if (asset) {
                    getAssetBidPrice(asset.asset, function(order) {
                        var price;
                        if (order)
                            price = order.priceNQT;
                        else
                            price = 1; // cheating a bit for d3pie... 1e-8 is almost 0 anyway :)

                        //console.log(asset.name, obj.balanceQNT, price, asset.decimals);
                        dataContent.push({
                            label: asset.name,
                            value: parseInt(obj.balanceQNT) * price / (Math.pow(10, 8))
                        });

                        draw(dataContent);
                    });
                }
            });
        });

        var findContact = function(accountRS) {
            for (var i = 0; i < contacts.length; i++) {
                if (contacts[i].accountRS === accountRS) {
                    return contacts[i];
                }
            }

            return null;
        };

        // INCOME ANALYSIS
        NRS.sendRequest("getAccountTransactions+", {
            "account": NRS.accountInfo.accountRS,
            "timestamp": 0,
            "type": 0,
            "subtype": 0
        }, function(response) {
            var transactions = response.transactions;
            var h = []; // [{sender: XYZ, transactions: [], aggregated: {nbTransactions: xx, transactedAmount: }}]

            // sort transactions per senderRS
            $.each(transactions, function(i, t) {
                var ind = findIndexOfSender(h, t.senderRS);
                var item;

                if (ind === null) {
                    item = {
                        senderRS: t.senderRS,
                        transactions: [],
                        aggregated: {
                            nbTransactions: 0,
                            transactedAmountNQT: 0
                        }
                    };
                    item.transactions.push(t);
                    item.aggregated.nbTransactions += 1;
                    item.aggregated.transactedAmountNQT += t.amountNQT * 1e-8;

                    h.push(item);
                } else {
                    item = h[ind];
                    item.transactions.push(t);
                    item.aggregated.nbTransactions += 1;
                    item.aggregated.transactedAmountNQT += t.amountNQT * 1e-8;
                }

                if (i >= transactions.length - 1) {
                    h.sort(sortByAggregatedIncomeAmount);
                    h.reverse();

                    var chartData = [];
                    for (var j = 0; j < h.length; j++) {

                        var senderRS = h[j].senderRS;
                        var sender = findContact(senderRS);

                        chartData.push({
                            "label": sender ? sender.name : senderRS,
                            "value": h[j].aggregated.transactedAmountNQT
                        });
                    }
                    drawChart('incomeDistributionChart', 'Income Distribution', chartData);
                }
            });
        });

        $('.data-empty-container').html('');
    };

    return NRS;
}(NRS || {}, jQuery));

//File name for debugging (Chrome/Firefox)
//@ sourceURL=nrs.dividends_scanner.js
