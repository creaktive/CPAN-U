function (head, req) {
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

    var result = [];
    var row;
    while (row = getRow()) {
        var names = [];
        for (var name in row.value) {
            if (row.value.hasOwnProperty(name)) {
                names.push(name);
            }
        }

        var slice = {};
        names = rank_sort(names, row.value).splice(0, 10).sort();
        for (var i = 0; i < names.length; i++) {
            slice[names[i]] = row.value[names[i]];
        }

        result.push({
            "key": row.key,
            "value": slice
        });
    }

    var json = JSON.stringify({"rows": result});

    if (typeof(req.query['callback']) === 'undefined') {
        send(json + "\n");
    } else {
        send(req.query.callback + '(' + json + ");\n");
    }
}
