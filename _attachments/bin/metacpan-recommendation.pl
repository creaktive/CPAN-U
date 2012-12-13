#!/usr/bin/env perl
use common::sense;

use Benchmark;
use Carp qw(carp croak);
use JSON::XS;
use LWP::Protocol::Net::Curl encoding => '';
use LWP::UserAgent;
use Sort::Key::Top qw(rnkeytop);

my $t0 = Benchmark->new;

my $json = JSON::XS->new->canonical->pretty;
my $ua = LWP::UserAgent->new;

my (%user, %item);
for my $user_id (get_user_ids()) {
    for my $item (get_user_favorites($user_id)) {
        ++$user{$user_id}->{$item};
        $item{$item}->{$user_id} = $user{$user_id};
    }
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
    my $timestamp = time;
    my @res;

    # For each item in product catalog, I1
    while (my ($outer, $users) = each %item) {
        my %stuff;
        my $n = -1;

        # For each customer C who purchased I1
        while (my ($user, $favorites) = each %{$users}) {
            ++$n;

            # For each item I2 purchased by customer C
            for my $inner (keys %{$favorites}) {

                # Record that a customer purchased I1 and I2
                vec($stuff{$inner}, $n, 1) = 1;
            }
        }

        # For each item I2
        my $outer_bv = delete $stuff{$outer};
        my %sim;
        while (my ($inner, $inner_bv) = each %stuff) {

            # Compute the similarity between I1 and I2
            if (my $sim = cosine_similarity($outer_bv => $inner_bv)) {
                $sim{$inner} = (50 >= keys %{$item{$inner}})
                    ? $sim
                    : 0.01;
            }
        }

        push @res => map +{
            distribution=> $outer,
            timestamp   => $timestamp,
            similar     => $_,
            relevance   => 0 + sprintf(q(%0.2f) => $sim{$_}),
        }, rnkeytop { $sim{$_} } 20 => keys %sim;
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
