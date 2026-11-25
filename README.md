# Queue Order

A queue you run from a phone. Customers scan a code and take a number. You call the next one.

There is no database. The queue lives in the server's memory, and each phone remembers which queue it runs and which number it took.

## Run

Node 24 or later.

```sh
npm install
node server.mjs
```

Open the address it prints. Use the computer's network address, not `localhost`, when other phones need to scan the code.

## Two codes

- **Queue code.** On the customer QR. Scanning it opens the page where someone takes a number. The same phone keeps that number.
- **Pairing code.** On the counter, under “Add another phone”. Scanning it, or typing it, lets that phone call next, remove a number, close the queue, or delete it.

Close stops new numbers. Delete removes the queue from the server and from this phone. “Forget this phone” drops it from this phone and leaves the queue running.
