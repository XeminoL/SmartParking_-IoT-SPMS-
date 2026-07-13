# How we used AI

The course asks us to say clearly how we used generative AI, so here it is.

We used an AI assistant while working on this project. We used it mainly in two ways: to help research how real systems handle these problems, and to help draft and speed up writing.

For the research side, we asked it about things we did not know: how parking systems use sensors and MQTT, how the university login (CAS) works, and how payment gateways in Vietnam handle the callback after paying. We took what was useful and dropped the parts that did not fit our case. One thing we changed on our own was the whole framing: a lot of the generic material assumes a car park, and we pushed it toward the motorbike reality here, which changed how the entry lane and the slots work.

For the writing, it helped draft the requirements, the diagrams, and the design, and it generated a first version of the demo code. We did not take that as final. We read the requirements against the project brief, checked the diagrams matched the flows, and when we ran the demo we found and fixed real bugs. Two we remember: the price rule was picking the wrong tier so students were not getting their discount, and the simulation was emptying out instead of filling up, so the "nearly full" and "full" signs never showed. We fixed both and ran it again.

The decisions that matter in the design are ones we understand and stand behind: the barrier-free motorbike lane, tying the plate to the card for theft, treating the login as CAS, stubbing BKPay, and counting slots by adding and subtracting at the gates. The performance numbers in the requirements are targets to test, not things we measured. The screenshots are of the demo actually running.
