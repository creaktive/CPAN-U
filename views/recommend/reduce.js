function (keys, values, rereduce) {
    var rv = {};
    for (i in values) {
        var value = values[i];
        for (k in value) {
            rv[k] = value[k];
        }
    }
    return rv;
}
