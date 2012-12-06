(function ($) {
    'use strict';
    $(function () {
        function cpan_module_name (str) {
            return str.replace(new RegExp('-', 'g'), '::');
        }

        var dists = [];
        function process_dists (data) {
            dists = data;
            $.ajax({
                type: 'POST',
                url: 'https://api.metacpan.org/v0/release/_search',
                dataType: 'json',
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

        function on_leaderboard (data) {
            process_dists(
                data.facets.leaderboard.terms.map(function (obj) {
                    return obj.term;
                })
            );
        }

        function on_releases (data) {
            var metadata = {};
            for (var i = 0; i < data.hits.hits.length; i++) {
                var row = data.hits.hits[i].fields;
                metadata[row.distribution] = row;
            }

            $('#leaderboard-modules').html('');
            for (var j = 0; j < dists.length; j++) {
                var dist = dists[j];

                if (metadata.hasOwnProperty(dist)) {
                    var abstract = '';
                    if (typeof(metadata[dist].abstract) !== 'undefined') {
                        abstract = '<p>' + metadata[dist].abstract + '</p>';
                    }

                    $('#leaderboard-modules').append(
                        '<li id="dist-' + dist + '">' +
                        '<a class="distribution" href="https://metacpan.org/release/' +
                        dist +
                        '" target="_blank"><b>' +
                        cpan_module_name(dist) +
                        '</b></a>' +
                        ' <small>v' + metadata[dist].version + '</small>' +
                        abstract +
                        '<p class="similar">Loading...</p></li>'
                    );

                    $.ajax({
                        type: 'GET',
                        url: 'https://creaktive.cloudant.com/metacpan-recommendation/_design/recommend/_list/top/recommend',
                        cache: true,
                        dataType: 'jsonp',
                        data: {
                            group: true,
                            key: '"' + dist + '"',
                            stale: 'ok'
                        }
                    }).done(on_similar);
                } else {
                    $('#leaderboard-modules').append(
                        '<li id="dist-' + dist + '">' +
                        '<a class="distribution" target="_blank"><b>' +
                        cpan_module_name(dist) +
                        '</b></a>' +
                        '<p class="similar">Module/distribuition not found</p></li>'
                    );
                }
            }
        }

        function on_similar (data) {
            for (var i = 0; i < data.rows.length; i++) {
                var row = data.rows[i];

                $('#dist-' + row.key + ' .similar').html('Similar:');
                for (var similar in row.value) {
                    if (row.value.hasOwnProperty(similar)) {
                        $('#dist-' + row.key + ' .similar').append(
                            ' <a class="btn btn-small btn-info" type="button" href="https://metacpan.org/release/' +
                            similar +
                            '" target="_blank">' +
                            cpan_module_name(similar) +
                            '</a>'
                        );
                    }
                }
            }

            $('button').attr("disabled", false);
        }

        function process_leaderboard () {
            $('button').attr("disabled", true);

            $.ajax({
                type: 'POST',
                url: 'https://api.metacpan.org/v0/favorite/_search',
                dataType: 'json',
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
        }

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
            
            $('button').attr("disabled", false);
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
                cache: true,
                dataType: 'jsonp',
                data: {
                    group: true,
                    keys: '["' + favs.join('","') + '"]',
                    stale: 'ok'
                }
            }).done(on_user_recommendation);
        }

        $('#process-leaderboard').click(function () {
            process_leaderboard();
        });

        $('#query-recommendation').submit(function () {
            var query = $('#cpanu-query').val();
            query = query.replace(/[\,'"\s]+/g, ' ');

            function query_as_dists () {
                var query_list = $.unique(
                    $.grep(query.split(/\s+/), function (str) {
                        return str.length;
                    })
                );

                process_dists(query_list);
            }

            if (query.match(new RegExp('^[A-Za-z]+$'))) {
                pause_account = query.toUpperCase();
                $.ajax({
                    type: 'POST',
                    url: 'https://api.metacpan.org/v0/author/' + pause_account,
                    dataType: 'json',
                    data: {
                        join: 'favorite'
                    }
                })
                    .fail(function () {
                        query_as_dists();
                    })
                    .done(function (data) {
                        $('button').attr("disabled", true);
                        $('#for-user').html('Processing...');
                        
                        on_user_favorites(data);
                    });
            } else {
                query_as_dists();
            }

            return false;
        });

        process_leaderboard();
    });
})(window.jQuery);
