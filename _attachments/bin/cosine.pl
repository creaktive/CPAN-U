#!/usr/bin/env perl
use common::sense;

use Sort::Key::Top qw(rnkeytop);

my (%user, %item);
while (<>) {
    chomp;
    my ($user, $item) = split /\t/x;

    ++$user{$user}->{$item};
    $item{$item}->{$user} = $user{$user};
}

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
        my $sim = cosine_similarity($outer_bv => $inner_bv);
        $sim{$inner} = $sim if $sim;
    }

    for my $inner (rnkeytop { $sim{$_} } 10 => keys %sim) {
        #printf qq(%-40s\t%-40s\t%0.2f\n), $outer, $inner, $sim{$inner};
        say qq($outer\t$inner);
    }
}

sub cosine_similarity {
    my ($a, $b) = @_;

    my $nbits_a = unpack(q(%32b*) => $a);
    my $nbits_b = unpack(q(%32b*) => $b);

    return $nbits_a * $nbits_b
        ? unpack(q(%32b*) => $a & $b) / sqrt $nbits_a * $nbits_b
        : 0;
}
