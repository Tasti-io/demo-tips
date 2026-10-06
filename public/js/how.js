import { frame, $, LAW } from "./common.js";

frame({
  title: "How it works",
  sub: "What this demo does, which rules are built in and which are yours, and what a real one connects to.",
});

$("main").innerHTML = `
  <div class="prose">
    <h2>The job</h2>
    <p>
      Every pay period, a manager at each room pulls card tips out of the till, adds the cash someone declared, takes hours from the
      time clock, and splits it all in a spreadsheet by rules that live in their head. It takes a couple of hours per room. Then a
      server asks why their tips were lower this week, and the honest answer is that nobody can show them.
    </p>

    <h2>The order of things</h2>
    <p>
      <b>Decide</b> first: the clock and the till always leave things a formula should not guess, like a missing clock-out, a person
      on the clock in two rooms, a card batch that settled at six in the morning, a blank where the cash should be. Each one holds its
      pool, visibly, until a person decides. <b>Split</b> by written rules, to the cent. <b>Sign off</b> per room, by its own manager,
      against a fingerprint of the exact numbers; change anything afterwards and the sign-off lapses on its own. <b>Export</b> only
      when every room is signed. <b>Show</b> every person their own working.
    </p>

    <h2>The arithmetic</h2>
    <p>
      Tips are pooled by shift, by day or by week. In each pool the kitchen takes its share and the floor the rest; if nobody from one
      side was on, the whole pool stays with the other. Each side splits its part by hours on the clock times points for the role. Then
      everyone is rounded to the cent by the largest-remainder method, so nobody moves by more than a cent and the room adds up exactly.
      Split plus held always equals the tips taken; the page checks it in front of you.
    </p>

    <h2>Two rules that are not settings</h2>
    <p>
      British Columbia's Employment Standards Act leaves most of a tip policy to the employer: who shares, and in what proportion. Two
      things it does not. <b>Nothing may be deducted from tips</b>, which the Branch reads as including card processing fees and costs
      like breakage or a dine-and-dash fund (s.30.3). So that switch is locked off, and the server refuses it if asked. And <b>a
      director or shareholder of a corporate employer shares in a pool only if they regularly perform, to a substantial degree, the
      same work</b> as those who share in it (s.30.4). One shift does not settle that, which is why it is a recorded decision about a
      person, not a setting.
    </p>

    <h2>Where a model works, and where it does not</h2>
    <p>
      Nowhere. Every figure is arithmetic and exact matching, and the same inputs give the same pay to the cent every time. Pay is the
      last place to put anything that cannot explain itself.
    </p>

    <h2>What is real here and what is not</h2>
    <p>
      Harbour &amp; Co is fictional: the same four rooms, menu and opening hours as the other Tasti demos, with invented people and an
      invented week. The rules, the holds, the rounding, the fingerprinted sign-off and the file are the real thing. Nothing is stored
      on a server; your decisions stay in this browser.
    </p>
    <p>
      On a real account the hours come from the time clock or scheduling tool the group already uses, the tips from the POS, and the
      file goes to whichever payroll provider runs the pay run.
    </p>

    <h2>Where to start</h2>
    <p>
      With one question: <b>if a server asked how this week's tips were worked out, could anyone show them in under a minute?</b> If the
      answer is no, that is usually a twenty minute conversation.
    </p>
    <p class="cta"><a href="mailto:yuriy@tasti.io?subject=Tips">yuriy@tasti.io</a></p>

    <h2>Who built it</h2>
    <p>
      Yuriy Romanyuk, in Vancouver. I ran restaurant operations before I built software for them, which is why the page in this demo
      I care most about is the one the dishwasher opens on their phone.
    </p>
  </div>
  ${LAW}`;
