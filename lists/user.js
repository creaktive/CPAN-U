function (head, req) {
    var stop = {};

    try {
        var own = eval(req.query['keys']);
        for (var i = 0; i < own.length; i++) {
            stop[own[i]] = 1;
        }
    } catch(e) {
    }

    var bag = {};
    var row;
    while (row = getRow()) {
        for (var similar in row.value) {
            if (row.value.hasOwnProperty(similar) && typeof(stop[similar]) === 'undefined') {
                if (typeof(bag[similar]) === 'undefined') {
                    bag[similar] = 1;
                } else {
                    bag[similar]++;
                }
            }
        }
    }

    function rank_sort(keys, vals) {
        return keys.sort(function (b, a) {
            var delta = vals[a] - vals[b];
            if (delta) {
                return delta;
            } else if (a > b) {
                return -1;
            } else if (a < b) {
                return 1;
            } else {
                return 0;
            }
        });
    }

    var top_dists = [];
    for (var word in bag) {
        if (bag.hasOwnProperty(word) && bag[word] > 0) {
            top_dists.push(word);
        }
    }

    var json = JSON.stringify({
        "rows": rank_sort(top_dists, bag).map(function (name) {
            return {
                "key": name,
                "value": bag[name]
            };
        })
    });

    if (typeof(req.query['callback']) === 'undefined') {
        send(json + "\n");
    } else {
        send(req.query.callback + '(' + json + ");\n");
    }
}
