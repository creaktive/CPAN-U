#!/usr/bin/env perl
use common::sense;

use Sort::Key::Top qw(rnkeytop);

#=for comment
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
        say qq($outer\t$inner\n);
    }
}
#=cut

=for comment
sub _rnkeytop (&$@) {
    my ($keyfn, $n, @data) = @_;
    return grep { defined } (
        map { $_->[0] }
        sort { $b->[1] <=> $a->[1] or $a->[0] cmp $b->[0] }
        map { [$_ => $keyfn->()] }
            @data
    ) [0 .. $n - 1];
}

my %item;
my $last_user = '';
my $n = 0;
while (<>) {
    chomp;
    my ($user, $item) = split /\t/x;

    if ($last_user ne $user) {
        $last_user = $user;
        ++$n;
    }

    $item{$item} //= '';
    vec($item{$item}, $n, 1) = 1;
}

my @item = sort keys %item;
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

    for my $inner (rnkeytop { $sim{$_} } 10 => keys %sim) {
        #printf qq(%0.2f\t%-40s\t%-40s\n), $sim{$inner}, $outer, $inner;
        print qq($outer\t$inner\n);
    }
}
=cut

sub cosine_similarity {
    my ($a, $b) = @_;

    my $nbits_a = unpack(q(%32b*) => $a);
    my $nbits_b = unpack(q(%32b*) => $b);

    return $nbits_a * $nbits_b
        ? unpack(q(%32b*) => $a & $b) / sqrt $nbits_a * $nbits_b
        : 0;
}
