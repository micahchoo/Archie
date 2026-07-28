# Micah steers toward operational/topological questions, not internal plumbing

Offered seven lesson topics across two rounds (storage backends, hot-path perf, positioning,
reading a component, the CI gates, an image's journey). He rejected the two plumbing-flavoured
ones outright — "I don't like either option" — and when given a fresh spread ignored all four to
ask his own question: **"how does deployment work over ports."**

**What that signals.** The pull is toward *how the system runs and is served* — processes, origins,
what's listening, what ships — over *how a module is implemented internally*. Reasonable for
someone who directs the code rather than typing it: the runtime shape is what you can't get from
reading a diff.

**Implications**
- Lead future options with runtime/operational framings where an honest one exists. "Where your
  work actually lives" was probably the right topic sold with the wrong words — the OPFS/origin
  story is operational, but I pitched it as an interface with five implementations.
- Two rejections in a row means the menu was wrong, not the learner. When he names his own topic,
  that's the strongest signal available — build it, don't re-offer.
- Still unknown whether the plumbing topics are permanently out or just badly framed. Don't retire
  them; re-pitch from the runtime angle later and watch.
