# Tips

Live at **[tips.tasti.io](https://tips.tasti.io)**. Part of the
[Tasti.io demos](https://demo.tasti.io).

One pay week of tips across four rooms: card tips and declared cash from the
till, hours from the time clock, pooled by written rules, split to the cent,
signed off room by room, and exported as a payroll file. Every member of staff
gets a page that shows exactly how their share was worked out, pool by pool.

## The one rule

**Nothing is guessed. Anything undecided is held, visibly, never quietly folded
into someone's share.**

`lib/pool.js` runs in a fixed order, and the order is the design:

1. `detect()` finds what a person has to decide before any money moves: an open
   punch, someone on the clock in two rooms at once, a card batch that settled
   outside any shift, a company director on the clock, a close with no cash
   declared. These are found from the data by ordinary detection code, not read
   from a list of planted answers.
2. `resolve()` applies the decisions. Anything undecided holds its whole pool,
   never part of it, because a pool with one person's hours unknown cannot be
   split fairly for anyone else.
3. `distribute()` splits each pool by the policy, to the exact cent.
4. A manager signs off one room at a time, against a fingerprint of the numbers
   they saw. Change a rule or a decision afterwards and the sign-off lapses.
5. The payroll file exists only when every room is signed off on current numbers.

The arithmetic: tips are pooled by shift, day or week. The kitchen takes its
share and the floor the rest; if nobody from one side was on, the whole pool
stays with the other. Each side splits by hours on the clock times points for
the role. Rounding is by largest remainder (floor everyone, hand the leftover
cents to the largest remainders), so nobody moves by a cent or more and every
room adds up exactly. Split plus held always equals tips taken.

## Two rules that are not settings

British Columbia's Employment Standards Act leaves most of a tip policy to the
employer. Two things it does not, and both are built in rather than offered:

- **Nothing may be deducted from tips, card processing fees included** (s.30.3).
  The switch is locked off; `checkPolicy()` refuses it and says why.
- **A director or shareholder of a corporate employer shares in a pool only if
  they regularly perform, to a substantial degree, the same work** as those who
  share in it (s.30.4). One shift does not settle that, so it is a recorded
  decision about a person, defaulting to out.

The payroll file uses a non-vacationable tips earnings code, following the
Branch's guidance that vacation pay is not owed on tips. This is a demo of the
mechanics, not legal advice.

## How it stays correct

The server keeps nothing. The browser holds three things: decisions on the
exceptions, the pool policy, and which rooms have been signed off. Every request
sends them, and `lib/request.js` rebuilds and validates the whole week, so a bad
decision, an out-of-range policy or a forged approval is refused the same way at
every endpoint. A made-up fingerprint signs nothing. `lib/http.js` accepts POST
only, caps the body at 64 KB, and answers a bad body with a 400.

The self-test checks, among other things, that split equals tips to the cent
under every policy combination the page allows, that nobody is paid a negative
amount, that each person's statement totals their lines in the payroll file, and
that the request path has no network calls, storage or unseeded randomness.

**What is simulated.** Harbour & Co is the fictional group from
[harbour-data](https://github.com/Tasti-io/harbour-data), vendored under
`lib/harbour` with a `VERSION` hash the self-test checks. The people and the week
are invented: `lib/fixtures.js` generates punches and tips from a fixed seed, and
the dates slide so it is always last week. There is no connection to any time
clock, POS or payroll provider. On a real account the hours would come from the
group's time clock or scheduling tool, the tips from the POS, and the file would
go to whichever payroll provider runs the pay run.

## Layout

```
api/week.js            the whole week under the sent policy and decisions
api/statement.js       one person's week, with the working for each pool
lib/pool.js            detect, resolve, distribute, fingerprint, payroll file
lib/request.js         validates what the browser sent into one week
lib/fixtures.js        one seeded week of punches and tips with planted exceptions
lib/http.js            POST-only JSON endpoint wrapper with a body cap
lib/harbour/           vendored Harbour & Co dataset (rooms, staff, roles)
public/                the week, exceptions, policy, distribution, payroll and
                       staff pages
scripts/dev.mjs        local server using the same handlers
scripts/selftest.mjs   55 checks, no network
```

## Run

```bash
npm run check   # self-test, no network or API key needed
npm run dev     # local server on http://localhost:3060
```

No npm dependencies.
