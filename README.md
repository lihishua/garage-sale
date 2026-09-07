# Garage Sale

**A garage sale in a single link.**

You photograph what you're selling. You get one link. You send it to your neighbours.
They tap a heart on what they want and send you the list on WhatsApp.

🔗 **[garagesaleonline.app](https://garagesaleonline.app)**

---

## How it works

**If you're selling**

1. Open a sale with your email — no password. A code arrives by email and you type it in.
2. Upload photos of everything you're clearing out.
3. Give each one a name and a price, or mark it as a giveaway if you're not charging for
   it. Several photos of the same pile — a box of books, a stack of board games — become
   one listing rather than twenty, and each photo in it can be claimed separately.
4. Tag things however you like. The built-in tags are a starting point; any tag you
   invent is yours to reuse on the next item, and buyers get a filter for it.
5. Send your link to the neighbourhood WhatsApp group and get on with your day.

**If you're buying**

Open the link. No account, no signup, nothing to install. Tap the heart on anything you
want, then send the list. You'll get a WhatsApp message ready to send to the seller, and
your things are held for you so nobody else takes them while you sort out pickup.

Changed your mind? Cancel the request from the same phone you sent it on. Everything goes
back on sale, and back onto your own list, so you can trim it and send it again.

## Why it exists

Selling a flat's worth of furniture usually means twenty separate posts on a
neighbourhood group, each one drowning within the hour, and answering "is this still
available?" forty times.

This is one link. It stays current, it shows what's gone, and it tells you who asked for
what.

## What the seller sees

One board. The top of it is for getting things onto the board: the link, the photo
gallery, and the button that fills it. Below that is what's happening — the requests that
have come in, then a count of what's free, what's spoken for and what's sold, each of
which filters the grid beneath it.

Every request is a name, a phone number and a list. Message the buyer on WhatsApp in one
tap, mark things sold as they go, or remove the request altogether — which puts
everything it was holding straight back on sale.

## Signing in

There's no password. You ask for a code, it arrives by email, and you type it into the
app. The email carries a link as well, and tapping it works — but it opens in your
browser, and a browser and a home-screen app keep separate sessions. If you've added
Garage Sale to your home screen, the code is what keeps you signed in there.

## About the language

The interface is Hebrew, right to left. Every string has an English twin in
`lib/i18n.ts` and the layout is direction-agnostic, so an English version is a switch
rather than a rewrite — but Hebrew is what ships today.

---

## About this repository

This is the source code for the site above. It's here to be read, not to be run —
it isn't packaged for anyone else to host their own copy, and it's wired to one specific
database and domain.

If you want to sell things, use the site. If you're working on the code, everything
technical lives in **[SETUP.md](SETUP.md)** — configuration, running it locally,
the data model, and the design decisions behind it.

No licence is granted for reuse.
