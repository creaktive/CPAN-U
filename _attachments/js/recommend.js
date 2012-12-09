(function ($) {
    'use strict';
    $(function () {
        function lock_input () {
            $('button').attr("disabled", true);
            $('#loading').attr("style", "display: inline");
        }

        function unlock_input () {
            $('button').attr("disabled", false);
            $('#loading').attr("style", "display: hidden");
        }

        function cpan_module_name (str) {
            return str.replace(new RegExp('-', 'g'), '::');
        }

        function cpan_dist_name (str) {
            return str.replace(new RegExp('::', 'g'), '-');
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
            function tracker_release (obj) {
                window._gaq.push(['_trackEvent', 'distribuition', 'click', $(obj).attr('href')]);
            }

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
                        abstract = '<p class="lead">' + metadata[dist].abstract + '</p>';
                    }

                    $('#leaderboard-modules').append(
                        '<li id="dist-' + dist + '">' +
                        '<a class="distribution" href="https://metacpan.org/release/' +
                        dist +
                        '" target="_blank"><b>' +
                        cpan_module_name(dist) +
                        '</b></a>' +
                        ' v' + metadata[dist].version +
                        abstract +
                        '<p class="similar">Loading...</p></li>'
                    );

                    $('#leaderboard-modules #dist-' + dist + ' a.distribution').click(tracker_release);

                    $db.list(
                        'recommend/top',
                        'recommend',
                        {
                            group: true,
                            key: dist,
                            stale: 'ok'
                        }, {
                            success: on_similar
                        }
                    );
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
            function tracker_similar (obj) {
                window._gaq.push(['_trackEvent', 'similar', 'click', $(obj).attr('href')]);
            }

            for (var i = 0; i < data.rows.length; i++) {
                var row = data.rows[i];

                $('#dist-' + row.key + ' .similar').html('People who liked this module also liked:');
                for (var similar in row.value) {
                    if (row.value.hasOwnProperty(similar)) {
                        $('#dist-' + row.key + ' .similar').append(
                            ' <a class="btn btn-small btn-info" href="https://metacpan.org/release/' +
                            similar +
                            '" target="_blank">' +
                            cpan_module_name(similar) +
                            '</a>'
                        );
                    }
                }

                $('#dist-' + row.key + ' .similar .btn').click(tracker_similar);
            }

            unlock_input();
        }

        function process_leaderboard () {
            lock_input();

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
        function on_user_recommendation (top_dists) {
            $('#for-user').html(
                'Recommendation for ' +
                '<a href="https://metacpan.org/author/' +
                pause_account +
                '" target="_blank">' +
                pause_account +
                '</a>, based on ' +
                favs.length +
                ' preferred distributions:<br>'
            );

            for (var i = 0; i < top_dists.length; i++) {
                var name = top_dists[i];
                $('#for-user').append(
                    ' <a class="btn btn-small btn-inverse" href="https://metacpan.org/release/' +
                    name +
                    '" target="_blank">' +
                    cpan_module_name(name) +
                    '</a>'
                );
            }

            $('#for-user .btn').click(function () {
                window._gaq.push(['_trackEvent', 'recommendation', 'click', $(this).attr('href')]);
            });

            unlock_input();
        }

        function on_user_favorites () {
            var batch = $.merge([], favs);
            var queue = [];
            var step = 10;
            for (var i = 0; i < favs.length; i += step) {
                queue.push(batch.splice(0, step));
            }

            var done = queue.length;
            var bag = {};
            var tags = [];
            $(queue).each(function () {
                $db.list(
                    'recommend/user',
                    'recommend',
                    {
                        group: true,
                        keys: this,
                        stale: 'ok'
                    }, {
                        error: function () {
                            done--;
                        },
                        success: function (data) {
                            done--;

                            try {
                                data.rows.map(function (obj) {
                                    if ($.inArray(obj.key, favs) === -1) {
                                        if (typeof(bag[obj.key]) === 'undefined') {
                                            bag[obj.key] = obj.value;
                                            tags.push(obj.key);
                                        } else {
                                            bag[obj.key] += obj.value;
                                        }
                                        return;
                                    }
                                }).sort();
                            } catch (e) {
                            }

                            if (done === 0) {
                                tags = tags.sort(function (b, a) {
                                    var delta = bag[a] - bag[b];
                                    if (delta) {
                                        return delta;
                                    } else if (a > b) {
                                        return -1;
                                    } else if (a < b) {
                                        return 1;
                                    } else {
                                        return 0;
                                    }
                                }).splice(0, 20).sort();

                                //console.log('%o', tags);
                                on_user_recommendation(tags);
                            }
                        }
                    }
                );
            });
        }

        var $db = $.couch.db('metacpan-recommendation');

        $('#process-leaderboard').click(function () {
            process_leaderboard();
        });

        $('#query-recommendation').submit(function () {
            var query = $('#cpanu-query').val();
            query = query.replace(/[\,'"\s]+/g, ' ');

            function query_as_dists () {
                window._gaq.push(['_trackEvent', 'query', 'dist', query]);

                var query_list = $.grep(
                    query.split(/\s+/), function (str) {
                        return str.length;
                    }
                ).map(function (str) {
                    return cpan_dist_name(str);
                });

                process_dists(query_list);
            }

            lock_input();
            if (query.match(new RegExp('^[A-Za-z]+$'))) {
                pause_account = query.toUpperCase();
                $.ajax({
                    type: 'GET',
                    url: 'https://api.metacpan.org/v0/author/' + pause_account + '?join=favorite&join=release',
                    dataType: 'json'
                })
                    .fail(function () {
                        query_as_dists();
                    })
                    .done(function (data) {
                        window._gaq.push(['_trackEvent', 'query', 'user', pause_account]);

                        $('#for-user').html('Processing...');

                        var favorites = [];
                        try {
                            favorites = data.favorite.hits.hits.map(function (obj) {
                                return obj._source.distribution;
                            });
                        } catch (e) {
                        }

                        var dependencies = [];
                        var releases = [];
                        try {
                            releases = data.release.hits.hits.map(function (obj) {
                                for (var i = 0; i < obj._source.dependency.length; i++) {
                                    dependencies.push(cpan_dist_name(obj._source.dependency[i].module));
                                }
                                return obj._source.distribution;
                            });
                        } catch (e) {
                        }

                        var dups = $.merge($.merge($.merge([], releases), dependencies), favorites).sort();
                        favs = [];
                        for (var j = 0; j < dups.length; j++) {
                            if (dups[j] !== favs[favs.length - 1]) {
                                favs.push(dups[j]);
                            }
                        }

                        //console.log('%o', favs);
                        if (favs.length) {
                            on_user_favorites();
                        } else {
                            $('#for-user').html('<span class="btn btn-warning btn-block">user has no preferred distributions!</span>');
                        }
                    });
            } else {
                query_as_dists();
            }

            return false;
        });

        process_leaderboard();
    });
})(window.jQuery);
