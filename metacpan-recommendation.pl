#!/usr/bin/env perl
use common::sense;

use Benchmark;
use Carp qw(carp croak);
use JSON::XS;
use LWP::Protocol::Net::Curl encoding => '';
use LWP::UserAgent;
use Sort::Key::Top qw(rnkeytop);

my $t0 = Benchmark->new;

my %item;

my $json = JSON::XS->new->canonical;
my $ua = LWP::UserAgent->new;

my $n = 0;
for my $user_id (get_user_ids()) {
    for my $item (get_user_favorites($user_id)) {
        if (exists $item{$item}) {
            vec($item{$item}, $n, 1) = 1;
        } else {
            $item{$item} = '';
        }
    }
} continue {
    ++$n;
}

say $json->encode(find_recommendations());

my $t1 = Benchmark->new;
say STDERR timestr(timediff($t1, $t0));

sub get_user_ids {
    my $res = $ua->post(
        q(http://api.metacpan.org/v0/favorite/_search),
        Content => q{
            {
               "query" : {
                  "match_all" : {}
               },
               "facets" : {
                  "user" : {
                     "terms" : {
                        "size" : 100000,
                        "field" : "user"
                     }
                  }
               },
               "size" : 0
            }
        },
    );
    croak q(bad response: ) . $res->status_line
        if $res->is_error;

    my $users = eval { $json->decode($res->content)->{facets}{user}{terms} };
    croak q(bad JSON: ) . $@
        if $@ or not defined $users;

    return map {
        $_->{count} > 1
            ? $_->{term}
            : ()
    } @{$users};
}

sub get_user_favorites {
    my ($user) = @_;

    my $res = $ua->post(
        q(http://api.metacpan.org/v0/favorite/_search),
        Content => qq(
            {
               "query" : {
                  "match_all" : {}
               },
               "filter" : {
                  "term" : {
                     "user" : "$user"
                  }
               },
               "fields" : [
                  "distribution"
               ],
               "size" : 5000
            }
        ),
    );
    if ($res->is_error) {
        carp q(bad response: ) . $res->status_line;
        return;
    }

    my $favorites = eval { $json->decode($res->content)->{hits}{hits} };
    carp q(bad JSON: ) . $@
        if $@ or not defined $favorites;

    return map {
        $_->{fields}{distribution}
    } @{$favorites};
}

sub find_recommendations {
    my @res;

    my @item = keys %item;
    my @cosine_table;
    for my $i (0 .. $#item) {
        my $outer = $item[$i];
        my %sim;

        for my $j (0 .. $#item) {
            my $inner = $item[$j];

            my $sim;
            if ($i < $j and $sim = cosine_similarity(@item{$inner => $outer})) {
                $cosine_table[$i][$j] = $sim;
                $sim{$inner} = $sim;
            } elsif ($i > $j and $sim = $cosine_table[$j][$i]) {
                $sim{$inner} = $sim;
            }
        }

        push @res => map +{
            distribution=> $outer,
            similar     => $_,
            relevance   => $sim{$_},
        }, rnkeytop { $sim{$_} } 10 => keys %sim;

        #push @res => {
        #    _id => $outer,
        #    recommendations => [
        #        map +{
        #            distribution=> $_,
        #            similarity  => $sim{$_},
        #        }, rnkeytop { $sim{$_} } 10 => keys %sim
        #    ],
        #} if %sim;
    }

    return { docs => \@res };
}

sub cosine_similarity {
    my ($a, $b) = @_;

    my $nbits_a = unpack(q(%32b*) => $a);
    my $nbits_b = unpack(q(%32b*) => $b);

    return $nbits_a * $nbits_b
        ? unpack(q(%32b*) => $a & $b) / sqrt $nbits_a * $nbits_b
        : 0;
}
