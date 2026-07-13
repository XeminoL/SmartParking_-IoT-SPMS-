# How AI was used

The course requires a clear statement of how generative AI was used, so here it is.

An AI assistant was used on this project in two main ways: to research how real systems handle these problems, and to draft and speed up the writing.

On the research side, it was asked about things that were unfamiliar: how parking systems use sensors and MQTT, how the university login (CAS) works, and how payment gateways in Vietnam handle the callback after paying. The useful parts were kept and the parts that did not fit were dropped. One thing changed by hand was the whole framing: much of the generic material assumes a car park, and it was pushed toward the motorbike reality here, which changed how the entry lane and the slots work.

On the writing side, it helped draft the requirements, the diagrams, and the design, and it generated a first version of the demo code. That first version was not taken as final. The requirements were checked against the project brief, the diagrams against the flows, and running the demo turned up real bugs: the price rule picked the wrong tier so students lost their discount, and the simulation drained instead of filling, so the "nearly full" and "full" signs never showed. Both were fixed and the demo re-run.

The decisions that matter in the design are understood and defensible: the barrier-free motorbike lane, tying the plate to the card for theft, treating the login as CAS, stubbing BKPay, and counting slots by adding and subtracting at the gates. The performance numbers in the requirements are targets to test, not measured results. The screenshots are of the demo actually running.
