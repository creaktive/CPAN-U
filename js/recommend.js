(function ($) {
    'use strict';
    $(function () {
        function cpan_module_name (str) {
            return str.replace(new RegExp('-', 'g'), '::');
        }

        var dists = [];
        function on_leaderboard (data) {
            dists = data.facets.leaderboard.terms.map(function (obj) {
                return obj.term;
            });

            $.ajax({
                type: 'POST',
                url: 'https://api.metacpan.org/v0/release/_search',
                data: {
                    source: JSON.stringify({
                        "query": {
                            "terms": { "release.distribution": dists }
                        },
                        "filter": {
                            "term" : {
                                "release.status": "latest"
                            }
                        },
                        "fields": [ "distribution", "abstract", "version" ]
                    })
                }
            }).done(on_releases);
        }

        function on_releases (data) {
            var metadata = {};
            for (var i = 0; i < data.hits.hits.length; i++) {
                var row = data.hits.hits[i].fields;
                metadata[row.distribution] = row;
            }

            for (var j = 0; j < dists.length; j++) {
                var dist = dists[j];

                $('#leaderboard-modules').append(
                    '<li id="dist-' + dist + '">' +
                    '<a class="distribution" href="https://metacpan.org/release/' +
                    dist +
                    '" target="_blank"><b>' +
                    cpan_module_name(dist) +
                    '</b></a>' +
                    ' <small>v' + metadata[dist].version + '</small>' +
                    '<p>' + metadata[dist].abstract + '</p>' +
                    '<p class="similar">Loading...</p></li>'
                );

                $.ajax({
                    type: 'GET',
                    url: 'https://creaktive.cloudant.com/metacpan-recommendation/_design/recommend/_view/recommend',
                    dataType: 'jsonp',
                    data: {
                        group: true,
                        key: '"' + dist + '"',
                        stale: 'ok'
                    }
                }).done(on_similar);
            }
        }

        function on_similar (data) {
            function rank_sort (b, a) {
                var delta = rank[a] - rank[b];
                if (delta) {
                    return delta;
                } else if (a > b) {
                    return -1;
                } else if (a < b) {
                    return 1;
                } else {
                    return 0;
                }
            }

            for (var i = 0; i < data.rows.length; i++) {
                var row = data.rows[i];

                var rank = {};
                var tags = [];
                for (var similar in row.value) {
                    if (row.value.hasOwnProperty(similar)) {
                        rank[similar] = row.value[similar];
                        tags.push(similar);
                    }
                }

                tags = tags.sort(rank_sort).splice(0, 10).sort();

                $('#dist-' + row.key + ' .similar').html('Similar:');
                for (var j = 0; j < tags.length; j++) {
                    //console.log("%s %s", tags[i], rank[tags[i]]);
                    $('#dist-' + row.key + ' .similar').append(
                        ' <a class="btn btn-small btn-info" type="button" href="https://metacpan.org/release/' +
                        tags[j] +
                        '" target="_blank">' +
                        cpan_module_name(tags[j]) +
                        '</a>'
                    );
                }
            }
        }

        $.ajax({
            type: 'POST',
            url: 'https://api.metacpan.org/v0/favorite/_search',
            data: {
                source: JSON.stringify({
                    "query": {
                        "match_all": {}
                    },
                    "facets": {
                        "leaderboard": {
                            "terms": {
                                "field": "distribution",
                                "size": 10
                            }
                        }
                    },
                    "size": 0
                })
            }
        }).done(on_leaderboard);

        var pause_account = '';
        var favs = [];
        function on_user_recommendation (data) {
            //console.log('%o', data.rows);
            var top_dists = data.rows.splice(0, 10).map(function (obj) {
                return obj.key;
            }).sort();

            $('#for-user').html(
                'Recommendation for ' +
                '<a href="https://metacpan.org/author/' +
                pause_account +
                '" target="_blank">' +
                pause_account +
                '</a>, based on ' +
                favs.length +
                ' favorited distributions:<br>'
            );
            for (var i = 0; i < top_dists.length; i++) {
                var name = top_dists[i];
                $('#for-user').append(
                    ' <a class="btn btn-small btn-inverse" type="button" href="https://metacpan.org/release/' +
                    name +
                    '" target="_blank">' +
                    cpan_module_name(name) +
                    '</a>'
                );
            }
        }

        function on_user_favorites (data) {
            try {
                favs = data.favorite.hits.hits.map(function (obj) {
                    return obj._source.distribution;
                });
            } catch(e) {
                $('#for-user').html('<span class="btn btn-warning btn-block">user has no registered favorites!</span>');
                return;
            }

            $.ajax({
                type: 'GET',
                url: 'https://creaktive.cloudant.com/metacpan-recommendation/_design/recommend/_list/user/recommend',
                dataType: 'jsonp',
                data: {
                    group: true,
                    keys: '["' + favs.join('","') + '"]',
                    stale: 'ok'
                }
            }).done(on_user_recommendation);
        }

        $('#query-recommendation').submit(function () {
            pause_account = $('#pause_account').val().toUpperCase();

            $('#for-user').html('Processing...');
            $.ajax({
                type: 'POST',
                url: 'https://api.metacpan.org/v0/author/' + pause_account,
                data: {
                    join: 'favorite'
                }
            })
                .fail(function (jqXHR, textStatus, errorThrown) {
                    $('#for-user').html('<span class="btn btn-danger btn-block">Error: ' + errorThrown + '</span>');
                })
                .done(on_user_favorites);

            return false;
        });
    });
})(window.jQuery);
