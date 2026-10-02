# 喵喵中文 Meow Chinese

A cosy pixel-art Chinese practice app for a Primary 3 child. She looks after a kitten, and does 听写 (spelling) practice to earn coins for food, clothes and garden items.

## How it works

- **听写 Spelling:** the kitten reads a word aloud. She writes it by hand in the 田字格 boxes, and the app checks each stroke as she writes.
  - If she gets a word wrong, she watches the stroke order, traces the word, and then gets the same word again later in the round, from memory.
- **错词本 Mistakes book:** missed words stay here until she writes them correctly on the first try twice in a row.
- **Daily tasks:** finish one round, get 5 words right first time, and care for the kitten. Each task earns coins, and finishing all three earns a bonus and builds a streak.
- **🔒 Parent area:** this is protected by a PIN. In it you can:
  - add each week's list (one word per line, with an optional `| sentence`)
  - see progress and the words she needs to work on
  - change the voice, add coins, and back up or restore everything

## On the iPad

1. Open the site in Safari.
2. Tap **Share**, then **Add to Home Screen**. The app then opens full-screen, and its saved data is kept safely.
3. For a clearer voice, go to **Settings → Accessibility → Spoken Content → Voices → Chinese (China mainland)** and download a voice.

## Tech

- Static site with no build step, hosted on GitHub Pages.
- Handwriting checking uses [Hanzi Writer](https://hanziwriter.org) (MIT). Stroke data comes from the `hanzi-writer-data` package, which is derived from Make Me a Hanzi (Arphic Public License).
- Pinyin comes from [pinyin-pro](https://github.com/zh-lx/pinyin-pro) (MIT).
- Progress is saved in the browser on the device. Supabase backup and Claude-powered features (free-writing checks, vocabulary, composition) are planned next.
