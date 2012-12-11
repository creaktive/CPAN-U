function (keys, values, rereduce) {
    var rv = {};

    for (var i = 0; i < values.length; i++) {
        var value = values[i];
        for (var k in value) {
            if (value.hasOwnProperty(k)) {
                if (rv.hasOwnProperty(k)) {
                    rv[k] = Math.max(value[k], rv[k]);
                } else {
                    rv[k] = value[k];
                }
            }
        }
    }

    var rvk = [];
    for (var j in rv) {
        if (rv.hasOwnProperty(j)) {
            rvk.push(j);
        }
    }

    rvk = rvk.sort(function (b, a) {
        var delta = rv[a] - rv[b];
        if (delta) {
            return delta;
        } else if (a > b) {
            return -1;
        } else if (a < b) {
            return 1;
        } else {
            return 0;
        }
    }).splice(0, 10);

    var clean = {};
    for (var i = 0; i < rvk.length; i++) {
        clean[rvk[i]] = rv[rvk[i]];
    }

    return clean;
}
