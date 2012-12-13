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
                url: 'https://api.metacpan.org/release/_search',
                dataType: 'json',
                data: {
                    source: JSON.stringify({
                        "query": {
                            "terms": { "distribution": dists }
                        },
                        "filter": {
                            "term" : {
                                "release.status": "latest"
                            }
                        },
                        "fields": [ "distribution", "abstract", "version" ],
                        "size": 5000
                    })
                }
            }).done(on_releases);
        }

        function on_leaderboard (data) {
            $('#alert').append(
                '<div class="alert fade in">' +
                '<button type="button" class="close" data-dismiss="alert">×</button>' +
                'Displaying modules from <a href="https://metacpan.org/favorite/leaderboard" target="_blank">MetaCPAN Leaderboard</a>. ' +
                'Use the <strong>Recommend</strong> button to query specific modules and your own CPAN ID ' +
                '(a.k.a. <a href="http://pause.perl.org/" target="_blank">PAUSE</a> account)' +
                '</div>'
            );
            $('.alert').alert();

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
                            stale: 'update_after'
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

            unlock_input();
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
        }

        function process_leaderboard () {
            lock_input();

            $.ajax({
                type: 'POST',
                url: 'https://api.metacpan.org/favorite/_search',
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
                        stale: 'update_after'
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
                                $('#alert').append(
                                    '<div class="alert fade in">' +
                                    '<button type="button" class="close" data-dismiss="alert">×</button>' +
                                    'Found a total of ' +
                                    tags.length +
                                    " module suggestions based on author's preferences. " +
                                    'Showing <strong>Top 10</strong> recommendations.<br>' +
                                    'Tag the modules you already know as favorites at MetaCPAN to refine the recommendation.' +
                                    '</div>'
                                );
                                $('.alert').alert();

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
                                }).splice(0, 10).sort();

                                //console.log('%o', tags);
                                process_dists(tags);
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

        $('#cpanu-query').typeahead({
            items: 10,
            minLength: 2,
            source: function (query, process) {
                return $.ajax({
                    type: 'GET',
                    url: 'https://api.metacpan.org/search/autocomplete',
                    dataType: 'json',
                    data: {
                        q: cpan_dist_name(query),
                        size: 10
                    }
                }).done(function (data) {
                    var res = [];

                    try {
                        res = data.hits.hits.map(function (obj) {
                            return cpan_module_name(obj.fields.distribution);
                        });
                    } catch (e) {
                    }

                    return process(res);
                });
            }
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
                    type: 'POST',
                    url: 'https://api.metacpan.org/author/' + pause_account,
                    dataType: 'json',
                    data: {
                        join: 'favorite'
                    }
                })
                    .fail(function () {
                        query_as_dists();
                    })
                    .done(function (data) {
                        window._gaq.push(['_trackEvent', 'query', 'user', pause_account]);

                        var favorites = [];
                        try {
                            favorites = data.favorite.hits.hits.map(function (obj) {
                                return cpan_dist_name(obj._source.distribution);
                            });
                        } catch (e) {
                        }

                        $.ajax({
                            type: 'POST',
                            url: 'https://api.metacpan.org/release/_search',
                            dataType: 'json',
                            data: {
                                source: JSON.stringify({
                                    "query" : {
                                        "match_all" : {}
                                    },
                                    "filter" : {
                                        "and" : [
                                            { "term" : { "author" : pause_account } },
                                            { "term" : { "status" : "latest" } }
                                        ]
                                    },
                                    "fields" : [
                                        "distribution",
                                        "dependency.module"
                                    ],
                                    "size" : 5000
                                })
                            }
                        })
                            .fail(function () {
                                query_as_dists();
                            })
                            .done(function (data) {
                                var dependencies = [];
                                var releases = [];
                                try {
                                    releases = data.hits.hits.map(function (obj) {
                                        if (obj.fields.hasOwnProperty('dependency.module')) {
                                            for (var i = 0; i < obj.fields['dependency.module'].length; i++) {
                                                dependencies.push(cpan_dist_name(obj.fields['dependency.module'][i]));
                                            }
                                        }
                                        return cpan_dist_name(obj.fields.distribution);
                                    });
                                } catch (e) {
                                }

                                var dups = $.merge($.merge($.merge([], releases), dependencies), favorites).sort();
                                favs = [];
                                for (var j = 0; j < dups.length; j++) {
                                    if (dups[j] !== '' && dups[j] !== favs[favs.length - 1]) {
                                        favs.push(dups[j]);
                                    }
                                }

                                //console.log('%o', favs);
                                if (favs.length) {
                                    $('#alert').append(
                                        '<div class="alert fade in">' +
                                        '<button type="button" class="close" data-dismiss="alert">×</button>' +
                                        'Computing recommendation for ' +
                                        '<a href="https://metacpan.org/author/' +
                                        pause_account +
                                        '" target="_blank">' +
                                        pause_account +
                                        '</a>, based on ' +
                                        favs.length +
                                        ' favorited, own and depended modules... (may take several seconds)' +
                                        '</div>'
                                    );
                                    $('.alert').alert();

                                    on_user_favorites();
                                } else {
                                    $('#alert').append(
                                        '<div class="alert fade in">' +
                                        '<button type="button" class="close" data-dismiss="alert">×</button>' +
                                        'No preference data available for user ' +
                                        '<a href="https://metacpan.org/author/' +
                                        pause_account +
                                        '" target="_blank">' +
                                        pause_account +
                                        '</a>' +
                                        '</div>'
                                    );
                                    $('.alert').alert();

                                    query_as_dists();
                                }
                            });
                    });
            } else {
                query_as_dists();
            }

            return false;
        });

        process_leaderboard();
    });
})(window.jQuery);
