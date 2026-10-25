import crypto from "crypto";

export const WELCOME_TEXTS_en = [
  "🫀⃝⃪⃔⃕🫵🏻 &mention 🥺❤️🌸\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Welcome to!*  &name\n" +
    "                 *❛❛ Feelings never change 🦋 ❜❜*\n" +
    "*Some moments may change… but our true feelings never do ✨🌸💙*\n" +
    "             *This is a fun hangout group ⎯⃝🥹🍃💘*\n" +
    "      *We enjoy late-night songs, Truth & Dare 🦚🌻.*\n" +
    "                       *Don’t leave us ☝️🥹🍒🤌*\n" +
    "                                  *⎯͢⎯⃝💞 Welcome once again!*\n" +
    "*We’re ready to steal your sleep tonight 🫵🥹💖🦚*\n" +
    "*Thanks for joining us ❤‍🩹🌺*\n" +
    "*Members:> &size 🫵🎀* &pp",

  "🌸⃝⃕⃔🫵🏻 &mention 💖✨\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Welcome to our little world!*  &name\n" +
    "               *❛❛ New face, same warm heart ❜❜*\n" +
    "*Every new arrival brings a little more light, a little more joy, and a little more reason to smile 🌙💫*\n" +
    "            *Stay with us, laugh with us, and make memories with us 🫶🍃*\n" +
    "                       *You are not just a member — you are family 💘*\n" +
    "*Welcome to the vibe of love, fun, and endless conversations 🌷*\n" +
    "*Members:> &size 🫵🎀* &pp",

  "🦋✨ &mention 🫵🏻❤️\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Hello and Welcome!*  &name\n" +
    "                 *❛❛ Some people arrive like a blessing ❜❜*\n" +
    "*Your presence has added a beautiful meaning to this group 🌸*\n" +
    "*Here, every smile matters, every word matters, and every person matters 💞*\n" +
    "            *We hope this place becomes one of your sweetest memories 🥹🍒*\n" +
    "                       *Glad to have you here once again ✨*\n" +
    "*Members:> &size 💖* &pp",

  "🌷⃝⃪⃔⃕🫵🏻 &mention 💫\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Welcome to the family!*  &name\n" +
    "               *❛❛ Where words become memories ❜❜*\n" +
    "*We gather here not just to chat, but to create little moments that stay forever 🌙🌸*\n" +
    "*May your stay be full of fun, peace, late-night talks, and beautiful friendships 🫶*\n" +
    "            *This group is a small corner of happiness in a busy world 🍃💖*\n" +
    "                       *So relax, enjoy, and feel at home ✨*\n" +
    "*Members:> &size 🫵🎀* &pp",

  "💖⃝⃕⃔🫵🏻 &mention 🌸\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Welcome back to the magic!*  &name\n" +
    "                 *❛❛ Hearts remember kindness ❜❜*\n" +
    "*A beautiful soul has stepped into this space, and the whole atmosphere feels warmer already 🥰*\n" +
    "*We hope you find laughter here, comfort here, and a little piece of happiness here every day 🌷*\n" +
    "            *Let’s make this group colorful with good vibes and sweet memories 🌈✨*\n" +
    "                       *Happy to have you with us again 🤍*\n" +
    "*Members:> &size 🫵🎀* &pp",

  "🥹💞 &mention 🫵🏻🌸\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ A warm welcome to you!*  &name\n" +
    "               *❛❛ Some arrivals feel like sunshine ❜❜*\n" +
    "*Your joining made this group shine a little brighter and smile a little wider 🌞✨*\n" +
    "*May this place bring you joy, friendship, and endless little reasons to stay happy 🌺*\n" +
    "            *We are glad you are here, and we hope you feel the love in every message 💌*\n" +
    "                       *Welcome to our lovely chaos 🫶*\n" +
    "*Members:> &size 💖* &pp",

  "🌼⃝⃪⃔⃕🫵🏻 &mention 💘\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Welcome into our circle!*  &name\n" +
    "                 *❛❛ Good people make good places ❜❜*\n" +
    "*And now that you are here, this place feels even better, even softer, and even more alive 🌸*\n" +
    "*We hope your time here is full of joy, sweet talks, and beautiful connections 💫*\n" +
    "            *Stay close, stay happy, and make memories that never fade 🫶*\n" +
    "                       *Thanks for coming, and welcome again 🌷*\n" +
    "*Members:> &size 🫵🎀* &pp",

  "🫶⃝⃕⃔ &mention ❤️‍🩹🌸\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Welcome dear friend!*  &name\n" +
    "                 *❛❛ A new chapter begins here ❜❜*\n" +
    "*Every person brings a different kind of light, and yours is truly special ✨*\n" +
    "*May this group give you comfort when you are tired, laughter when you are low, and company when you feel alone 🌙*\n" +
    "            *Feel free, feel loved, and feel at home with us 🥰*\n" +
    "                       *Welcome to this beautiful journey 💞*\n" +
    "*Members:> &size 🫵🎀* &pp",

  "🌙⃝⃪⃔⃕🫵🏻 &mention 💖\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Welcome to our heart-space!*  &name\n" +
    "                 *❛❛ Kind souls never feel out of place ❜❜*\n" +
    "*And a kind soul like you always belongs somewhere warm, calm, and beautiful 🌸*\n" +
    "*This group may be small, but the feelings here are real, deep, and meaningful 🫶*\n" +
    "            *We hope you stay, smile, and enjoy the ride with us 🌷*\n" +
    "                       *Glad to see you here ✨*\n" +
    "*Members:> &size 💖* &pp",

  "✨⃝⃪⃔⃕🫵🏻 &mention 🌸💘\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Welcome, precious soul!*  &name\n" +
    "                 *❛❛ Small moments can hold big feelings ❜❜*\n" +
    "*This is one of those moments — because your arrival made the whole group feel a little brighter 🌹*\n" +
    "*May your time here be full of respect, laughter, and warm memories that stay forever 💫*\n" +
    "            *We are lucky to have you in this family 🫂*\n" +
    "                       *Welcome once again, with love 🤍*\n" +
    "*Members:> &size 🫵🎀* &pp",

  "💫⃝⃕⃔🫵🏻 &mention 🥹🌷\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Welcome to the lovely corner of our world!*  &name\n" +
    "                 *❛❛ Every heart wants a place to belong ❜❜*\n" +
    "*Here, we don’t just talk — we share feelings, support each other, and create moments that stay in memory 🌸*\n" +
    "*May your stay be peaceful, fun-filled, and full of sweet surprises ✨*\n" +
    "            *Your presence is truly appreciated 💖*\n" +
    "                       *Welcome and enjoy your time here 🌙*\n" +
    "*Members:> &size 🫵🎀* &pp",

  "🌺⃝⃪⃔⃕🫵🏻 &mention 💞\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Warm welcome to you!*  &name\n" +
    "                 *❛❛ Some vibes are felt, not explained ❜❜*\n" +
    "*And your vibe already feels soft, bright, and beautiful in this space 🦋*\n" +
    "*We hope you find laughter, loyalty, and lovely people here to make your day better 🌷*\n" +
    "            *Stay connected and enjoy every moment with us 💫*\n" +
    "                       *Happy to welcome you 🤍*\n" +
    "*Members:> &size 🫵🎀* &pp",

  "🫀⃝⃪⃔⃕🫵🏻 &mention 🌸✨\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Welcome to the heart of the group!*  &name\n" +
    "                 *❛❛ New people, new stories, new smiles ❜❜*\n" +
    "*Your joining has made this place feel even more alive and beautiful 🌙*\n" +
    "*Let this group be your small escape from stress, your place for fun, and your corner for peace 🫶*\n" +
    "            *We’re glad you found us 💖*\n" +
    "                       *Welcome once again, dear member 🌷*\n" +
    "*Members:> &size 🫵🎀* &pp",

  "🍒⃝⃪⃔⃕🫵🏻 &mention 💝\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Welcome, sweet soul!*  &name\n" +
    "                 *❛❛ Good company makes every place better ❜❜*\n" +
    "*And now this group has become a little better because you are here 🌸*\n" +
    "*May your chats be fun, your moments be memorable, and your time here be truly enjoyable ✨*\n" +
    "            *You are most welcome in this lovely space 🫂*\n" +
    "                       *Enjoy every bit of it 🌷*\n" +
    "*Members:> &size 🫵🎀* &pp",

  "🌸⃝⃪⃔⃕🫵🏻 &mention 🥺💖\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Welcome to our little home!*  &name\n" +
    "                 *❛❛ A place becomes special because of the people in it ❜❜*\n" +
    "*And your presence makes this place feel more special already ✨*\n" +
    "*May this group give you comfort, laughter, and friendships that stay longer than the chats do 🌙*\n" +
    "            *We are truly happy to have you here 🫶*\n" +
    "                       *Welcome and stay blessed 🤍*\n" +
    "*Members:> &size 🫵🎀* &pp",

  "💘⃝⃕⃔🫵🏻 &mention 🌷\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Welcome dear one!*  &name\n" +
    "                 *❛❛ The best people make the best memories ❜❜*\n" +
    "*And we hope you become a beautiful part of the memories we build here together 🌸*\n" +
    "*May this group keep your mood light, your heart warm, and your days colorful 💫*\n" +
    "            *We are grateful to have you among us 🫶*\n" +
    "                       *Welcome once again ✨*\n" +
    "*Members:> &size 🫵🎀* &pp",

  "🦚⃝⃕⃔ &mention 💙🌸\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Welcome to the lovely journey!*  &name\n" +
    "                 *❛❛ Every new join is a new little celebration ❜❜*\n" +
    "*And your arrival feels like one of those tiny celebrations that make life sweeter 🌷*\n" +
    "*May you find friendship, fun, and peaceful vibes in every corner of this group 🫶*\n" +
    "            *Stay with us and enjoy the beautiful flow of conversations ✨*\n" +
    "                       *Warm welcome to you 💖*\n" +
    "*Members:> &size 🫵🎀* &pp",

  "🌈⃝⃪⃔⃕🫵🏻 &mention 💞\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Welcome into the family circle!*  &name\n" +
    "                 *❛❛ Some people enter quietly but shine deeply ❜❜*\n" +
    "*We believe you are one of those people whose presence makes everything softer and brighter 🌸*\n" +
    "*May your time here be full of good energy, friendly people, and beautiful little memories 🥹*\n" +
    "            *This space is glad to have you 💫*\n" +
    "                       *Welcome once again, dear member 🌷*\n" +
    "*Members:> &size 🫵🎀* &pp",

  "🥰⃝⃕⃔🫵🏻 &mention 🌹\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Welcome to our happiness zone!*  &name\n" +
    "                 *❛❛ A welcoming heart makes every place softer ❜❜*\n" +
    "*And this group welcomes you with the softest heart and the warmest smile possible ✨*\n" +
    "*May your days here be full of joy, your nights be full of light chats, and your memories be full of sweetness 🌙*\n" +
    "            *We’re happy that you are here 🫶*\n" +
    "                       *Enjoy your stay and feel at home 💖*\n" +
    "*Members:> &size 🫵🎀* &pp",
];

export const GOODBYE_TEXTS_en = [
  "🥺💔 &mention 🫀\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Goodbye from!*  &name\n" +
    "                 *❛❛ Some goodbyes are silent, but feelings remain loud ❜❜*\n" +
    "*You are leaving this place, but your memory will stay here like a soft echo in the heart 🌸*\n" +
    "*We will miss your presence, your energy, and the little moments that made this group special ✨*\n" +
    "            *May your journey ahead be gentle, beautiful, and full of light 🌙*\n" +
    "                       *Take care and stay blessed 🫶*\n" +
    "*Members:> &size 💔* &pp",

  "💔⃝⃪⃔⃕🫵🏻 &mention 🌹\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Farewell to you!*  &name\n" +
    "                 *❛❛ Leaving is not the end of being remembered ❜❜*\n" +
    "*Some people stay in the heart even after they leave the place, and you are one of them 🥹*\n" +
    "*Your absence will be felt in this group, but your name will remain in our memories 🌷*\n" +
    "            *We wish you peace, happiness, and success in every step ahead ✨*\n" +
    "                       *Goodbye for now, and stay well 🤍*\n" +
    "*Members:> &size 🫵🎀* &pp",

  "🌙⃝⃪⃔⃕ &mention 🥀💔\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Goodbye dear friend!*  &name\n" +
    "                 *❛❛ Distance can change a place, but not true memories ❜❜*\n" +
    "*You may be leaving this group, but the moments we shared here will always stay warm in our hearts 🌸*\n" +
    "*May your path be filled with good fortune, gentle days, and beautiful reasons to smile again 💫*\n" +
    "            *You will be missed more than words can say 🫶*\n" +
    "                       *Take care of yourself always 💖*\n" +
    "*Members:> &size 💔* &pp",

  "🫂⃝⃪⃔⃕ &mention 💔✨\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Leaving with love...*  &name\n" +
    "                 *❛❛ Goodbyes are hard when someone mattered ❜❜*\n" +
    "*And you truly mattered here — to the conversations, to the vibe, and to the little warmth this group carried 🌷*\n" +
    "*We hope life treats you kindly and gives you more smiles than tears ahead 🌙*\n" +
    "            *Thank you for being part of this beautiful corner of memories 🌸*\n" +
    "                       *Farewell and be happy always 🫶*\n" +
    "*Members:> &size 🫵🎀* &pp",

  "🥹💔 &mention 🌺\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Goodbye from the heart of this group!*  &name\n" +
    "                 *❛❛ Some people leave footprints on the soul ❜❜*\n" +
    "*And you have left such a beautiful mark that it will not fade easily 🌹*\n" +
    "*Even after you leave, the memory of your presence will stay like a soft melody in the background ✨*\n" +
    "            *May your future shine brighter than ever before 💫*\n" +
    "                       *Stay safe, stay kind, and stay happy 🤍*\n" +
    "*Members:> &size 💔* &pp",

  "💫⃝⃪⃔⃕🫵🏻 &mention 🥀\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Farewell and thank you!*  &name\n" +
    "                 *❛❛ Every ending carries a little memory ❜❜*\n" +
    "*And your ending here carries the memory of kindness, presence, and quiet beauty 🌸*\n" +
    "*We will miss the energy you brought into this space and the comfort your words gave us 🫶*\n" +
    "            *May every road ahead lead you to peace, love, and success 🌷*\n" +
    "                       *Goodbye, and may life be sweet to you 💖*\n" +
    "*Members:> &size 🫵🎀* &pp",

  "🌸⃝⃪⃔⃕ &mention 💔🫀\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ A soft goodbye to you!*  &name\n" +
    "                 *❛❛ Some souls are hard to forget ❜❜*\n" +
    "*And yours is one of those souls that will stay in the memory of this group for a long time 🌙*\n" +
    "*Thank you for every moment, every message, and every little presence you left behind ✨*\n" +
    "            *We wish you a future full of peace and blessings 🌷*\n" +
    "                       *Take care, and remember us sometimes 🫶*\n" +
    "*Members:> &size 💔* &pp",

  "💖⃝⃪⃔⃕ &mention 🥺\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Goodbye, but not forgotten!*  &name\n" +
    "                 *❛❛ People come and go, memories remain ❜❜*\n" +
    "*And the memories you made here are gentle, warm, and worth keeping forever 🌸*\n" +
    "*We hope your journey ahead brings you closer to everything good and beautiful in life 🌈*\n" +
    "            *Your absence will be noticed deeply 💫*\n" +
    "                       *Farewell, and stay amazing 🤍*\n" +
    "*Members:> &size 🫵🎀* &pp",

  "🌷⃝⃪⃔⃕ &mention 💔🌙\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Goodbye from this little family!*  &name\n" +
    "                 *❛❛ Even small groups can hold big feelings ❜❜*\n" +
    "*And this group holds a lot of gratitude for the time you spent here 🌸*\n" +
    "*You will be missed, remembered, and wished well in every new step you take ✨*\n" +
    "            *May your path be bright, peaceful, and full of love 🫶*\n" +
    "                       *Goodbye for now, dear one 💖*\n" +
    "*Members:> &size 💔* &pp",

  "🥀⃝⃪⃔⃕🫵🏻 &mention 🌸\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Parting with respect and love!*  &name\n" +
    "                 *❛❛ A meaningful presence never truly leaves ❜❜*\n" +
    "*You may walk away from this group, but the softness you brought here will stay behind 🌷*\n" +
    "*We hope your future is kind to you, your heart stays light, and your dreams keep growing 💫*\n" +
    "            *Thank you for being here with us 🫂*\n" +
    "                       *Farewell and stay blessed always 🤍*\n" +
    "*Members:> &size 🫵🎀* &pp",

  "💔⃝⃪⃔⃕ &mention 🌺\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Goodbye, lovely soul!*  &name\n" +
    "                 *❛❛ Not every exit feels like an end ❜❜*\n" +
    "*Sometimes it feels like a chapter closing gently, leaving behind flowers of memory 🌸*\n" +
    "*Your time here was appreciated, and your presence will always be remembered with warmth ✨*\n" +
    "            *We are wishing you nothing but peace, success, and happiness 🌙*\n" +
    "                       *Take care and shine bright 🫶*\n" +
    "*Members:> &size 💔* &pp",

  "🌙⃝⃪⃔⃕ &mention 🥹💞\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Final goodbye for now!*  &name\n" +
    "                 *❛❛ The heart does not forget the kind ❜❜*\n" +
    "*And your kindness, your presence, and your time here will never be forgotten by this group 🌷*\n" +
    "*May the road ahead carry you to beautiful places and better days ✨*\n" +
    "            *Even after you leave, you will remain a memory here 🫶*\n" +
    "                       *Goodbye and take care always 💖*\n" +
    "*Members:> &size 🫵🎀* &pp",

  "🫀⃝⃪⃔⃕ &mention 💔🌸\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ A gentle farewell to you!*  &name\n" +
    "                 *❛❛ Some goodbyes are just love in another form ❜❜*\n" +
    "*And this goodbye is filled with respect, appreciation, and silent warmth 🌹*\n" +
    "*We hope the future treats you gently and gives you endless reasons to smile again 🌙*\n" +
    "            *Your place here will always be remembered 🫶*\n" +
    "                       *Goodbye and be happy always ✨*\n" +
    "*Members:> &size 💔* &pp",

  "🍂⃝⃪⃔⃕ &mention 🌷💔\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Farewell from the group heart!*  &name\n" +
    "                 *❛❛ Memories do not vanish with distance ❜❜*\n" +
    "*They stay behind, soft and quiet, holding the name of the person who mattered 🌸*\n" +
    "*You mattered here, and that is why this goodbye carries both sadness and gratitude ✨*\n" +
    "            *May life reward you with peace, love, and success 🫶*\n" +
    "                       *Take care, and never forget how valued you were 🤍*\n" +
    "*Members:> &size 🫵🎀* &pp",

  "💔⃝⃪⃔⃕🫵🏻 &mention 🌙\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Goodbye, and thank you for the memories!*  &name\n" +
    "                 *❛❛ What stays in the heart never truly leaves ❜❜*\n" +
    "*And the moments you shared here will stay as soft and beautiful memories forever 🌸*\n" +
    "*We wish you a life full of blessings, calm days, and reasons to smile 🪷*\n" +
    "            *This group will remember you with warmth ✨*\n" +
    "                       *Farewell and stay safe 🫶*\n" +
    "*Members:> &size 💔* &pp",

  "🌸⃝⃪⃔⃕🫵🏻 &mention 💖\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Goodbye from us all!*  &name\n" +
    "                 *❛❛ Some hearts leave, but their warmth remains ❜❜*\n" +
    "*That warmth is what we will remember about you — quiet, soft, and beautiful 🌷*\n" +
    "*May your next journey be kinder than the last and brighter than you expect 🌈*\n" +
    "            *We truly wish you all the best ahead 💫*\n" +
    "                       *Goodbye and stay blessed always 🤍*\n" +
    "*Members:> &size 🫵🎀* &pp",

  "🥹⃝⃪⃔⃕ &mention 💔🌺\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ A final warm goodbye!*  &name\n" +
    "                 *❛❛ Every goodbye carries a little love ❜❜*\n" +
    "*And this one carries the love and respect this group has for you 🌸*\n" +
    "*Thank you for being part of our conversations, our laughs, and our memories ✨*\n" +
    "            *May your future be full of success and peace 🌙*\n" +
    "                       *Take care, and goodbye for now 🫶*\n" +
    "*Members:> &size 💔* &pp",

  "🌼⃝⃪⃔⃕ &mention 🥺💔\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ Goodbye, dear member!*  &name\n" +
    "                 *❛❛ You may leave the chat, but not the memory ❜❜*\n" +
    "*Because the people who touch hearts always remain there in some quiet corner 🌸*\n" +
    "*We hope your path ahead is soft, safe, and full of beautiful surprises ✨*\n" +
    "            *We will remember your presence with gratitude 🫶*\n" +
    "                       *Farewell and be happy always 🤍*\n" +
    "*Members:> &size 🫵🎀* &pp",
];

export const WELCOME_TEXTS_bn = [
  "🫀⃝⃪⃔⃕🫵🏻 &mention 🥺❤️🌸\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ WELCOME TO OUR CHAOS! 🌚💞*\n" +
    "_তুমি ভাবছো একটা group join করেছো..._\n" +
    "*আসলে তুমি একটা আস্ত পাগলখানায় entry নিয়েছো 😭🔪😂*\n" +
    "━━━━━━━━━━━━━━\n" +
    "🌸 *এখানে কী পাওয়া যায়?*\n" +
    "🎧 গান\n" +
    "😂 Meme & হাসাহাসি\n" +
    "🦚 Truth & Dare\n" +
    "🌙 রাত জেগে আজাইরা আড্ডা\n" +
    "🔥 আর অবশ্যই... একটু drama 😌\n" +
    "━━━━━━━━━━━━━━\n" +
    "*তুমি এখন শুধু member না,*\n" +
    "_তুমি আমাদের daily chaos-এর official অংশ_ 🫵🥹💘\n" +
    "`Seen করে পালিয়ে গেলে কিন্তু জনগণ মেনে নেবে না 😭`\n" +
    "*Stay active & enjoy the madness! 🦋🌸*\n" +
    "~আর হ্যাঁ, এখন আর পালানোর option নেই~ 🤣\n" +
    "*Members:* `&size` 🫵🎀\n" +
    "&pp",

  "🌷⃝⃕⃔🫵🏻 &mention 💖✨\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ NEW MEMBER DETECTED 🚨😂*\n" +
    "_System successfully added a new human..._\n" +
    "*কিন্তু human নাকি future headache, সেটা এখনো জানা যায়নি 🌚*\n" +
    "━━━━━━━━━━━━━━\n" +
    "💗 *Relax... এখানে সবাই প্রথমে normal থাকে,*\n" +
    "_তারপর group-এর সাথে থাকতে থাকতে আসল রূপ বের হয়_ 😭🤣\n" +
    "🎶 গান হবে\n" +
    "🌙 Late night talk হবে\n" +
    "😂 Memes চলবে\n" +
    "🫶 Friendship হবে\n" +
    "🔪 আর মাঝে মাঝে roast-ও হবে\n" +
    "━━━━━━━━━━━━━━\n" +
    "*তাই চুপচাপ বসে থেকো না,*\n" +
    "`Hi` বলে শুরু করো... বাকিটা জনগণ সামলে নেবে 😌🤌\n" +
    "*Welcome to the family! 💞🌸*\n" +
    "*Members:* `&size` 🎀\n" +
    "&pp",

  "🦋⃝⃕⃔ &mention 🫵🏻🥹💙\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ CONGRATULATIONS! 🎉🌚*\n" +
    "_তুমি officially আমাদের group-এ ফেঁসে গেছো!_\n" +
    "*একবার join = unlimited entertainment 😭😂*\n" +
    "━━━━━━━━━━━━━━\n" +
    "📖 *নতুন মানুষ, নতুন গল্প,*\n" +
    "🌸 নতুন friendship,\n" +
    "🤣 নতুন meme,\n" +
    "🌙 নতুন late-night memories...\n" +
    "━━━━━━━━━━━━━━\n" +
    "`এখানে কেউ বেশি innocent হলে সন্দেহ করা হয় 😌🔍`\n" +
    "*তাই নিজের original version নিয়েই আসো,*\n" +
    "_কারণ এখানে fake personality বেশিদিন টিকে না_ 😭🤌\n" +
    "*Enjoy the vibe, make memories & don't disappear! 💘*\n" +
    "~Ghost করলে কিন্তু notification দিয়ে খুঁজে বের করব~ 👻😂\n" +
    "*Members:* `&size` 🫵🎀\n" +
    "&pp",

  "💐⃝⃕⃔🫵🏻 &mention 😭💖\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ SWAGATAM, নতুন মানুষ! 🌸✨*\n" +
    "_আজকে তোমাকে ফুল দিয়ে welcome করছি..._\n" +
    "*কয়েকদিন পর হয়তো roast করব 😭🔪*\n" +
    "━━━━━━━━━━━━━━\n" +
    "🫶 *এই group-এর rule খুব simple:*\n" +
    "_হাসো, কথা বলো, active থাকো,_\n" +
    "*আর অযথা serious হয়ে বসে থেকো না 🌚😂*\n" +
    "🎧 রাতের গান\n" +
    "💬 Random conversation\n" +
    "🎭 Truth & Dare\n" +
    "🤣 Non-stop trolling\n" +
    "❤️ আর কিছু genuine friendship\n" +
    "━━━━━━━━━━━━━━\n" +
    "*তোমার জন্য একটা virtual seat already ready 🪑🥹*\n" +
    "`এখন শুধু বসে পড়ো আর vibe শুরু করো!`\n" +
    "*Once again, Welcome! 💞🦋*\n" +
    "*Members:* `&size` 🎀\n" +
    "&pp",

  "🌙⃝⃕⃔ &mention 🫶💗\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ WELCOME, MAIN CHARACTER! 🎭✨*\n" +
    "_তোমার story-র নতুন chapter আজ থেকেই শুরু 📖🌸_\n" +
    "*কিন্তু সাবধান... এখানে side character-রাই অনেক সময় বেশি dangerous হয় 🌚🤣*\n" +
    "━━━━━━━━━━━━━━\n" +
    "💫 *তোমার mission:*\n" +
    "🫶 নতুন বন্ধু বানানো\n" +
    "😂 বেশি হাসা\n" +
    "🎧 গান শোনা\n" +
    "🌙 রাত জাগা\n" +
    "🤌 আর মাঝে মাঝে অন্যদের জ্বালানো\n" +
    "━━━━━━━━━━━━━━\n" +
    "*এই group শুধু chat করার জায়গা না,*\n" +
    "_এখানে random moments-ই পরে favourite memories হয়ে যায়_ 💙🦋\n" +
    "`তাই silent reader হয়ে বসে থেকো না 😭`\n" +
    "*Come, vibe with us! 💞🌺*\n" +
    "*Members:* `&size` 🫵🎀\n" +
    "&pp",

  "🍒⃝⃕⃔🫵🏻 &mention 💕🌚\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ ERROR 404: NORMAL PERSON NOT FOUND 🤖😂*\n" +
    "_তুমি join করেছো... এখন আমরাও চিন্তায় আছি_ 😭\n" +
    "*আরেকজন member না, আরেকজন potential problem পাওয়া গেছে 🌚🔪*\n" +
    "━━━━━━━━━━━━━━\n" +
    "😂 *এখানে হাসা mandatory*\n" +
    "🎧 *গান শোনা encouraged*\n" +
    "🌙 *রাত জাগা highly recommended*\n" +
    "🔥 *Drama completely unavoidable*\n" +
    "━━━━━━━━━━━━━━\n" +
    "`তুমি যতদিন থাকবে, ততদিন আমাদের stories বাড়বে 📖💗`\n" +
    "*তাই active থেকো, কথা বলো আর নিজের legendary moments তৈরি করো 😌✨*\n" +
    "~আর ২ দিন পর group leave করে আবার add হতে আসবে না~ 😭🤣\n" +
    "*Welcome to the madness! 🫶🌸*\n" +
    "*Members:* `&size` 🎀\n" +
    "&pp",
];

export const GOODBYE_TEXTS_bn = [
  "🥺💔 &mention 🫵🏻\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ OI BHAI, পালাচ্ছো নাকি? 🚨😭*\n" +
    "_এত তাড়াতাড়ি বিদায় নেওয়ার কী দরকার ছিল রে গাধা? 🌚🔪_\n" +
    "━━━━━━━━━━━━━━\n" +
    "*তুমি চলে গেলে group-এর একটা member কমে গেল,*\n" +
    "_কিন্তু আমাদের শান্তি যে বাড়বে, তার কোনো guarantee নেই 😂💔_\n" +
    "*তোমার আজাইরা কথা, random message আর annoying presence...*\n" +
    "🥹 এগুলো হয়তো আর সহ্য করতে হবে না।\n" +
    "━━━━━━━━━━━━━━\n" +
    "`কিন্তু সত্যি বলতে... একটু miss করব তোকে 🥲❤️‍🩹`\n" +
    "*যেখানে থাকিস ভালো থাকিস,*\n" +
    "_আর বেশি পাকা হয়ে আবার group-এ ফিরে আসিস না_ 😭🤌\n" +
    "~Goodbye, idiot~ 🫵😂\n" +
    "*Current Members:* `&size` 💔\n" +
    "&pp",

  "💔🌚 &mention 🫵🏻\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ BREAKING NEWS 🚨😂*\n" +
    "*একজন সন্দেহভাজন member group থেকে পালিয়ে গেছে!* 🏃‍♂️💨\n" +
    "_শেষবার তাকে দেখা গিয়েছিল group-এ বসে আজাইরা কথা বলতে 😭_\n" +
    "━━━━━━━━━━━━━━\n" +
    "*তুই ভাবছিস বের হয়ে বেঁচে গেলি?* 😌\n" +
    "`ভুল ভাবছিস বাপু... memories কিন্তু পিছনে আসবে 🌚😂`\n" +
    "*তোর roast, তোর drama, তোর random উপস্থিতি—সবই মনে পড়বে 🥹💔*\n" +
    "━━━━━━━━━━━━━━\n" +
    "_যাই হোক, ভালো থাকিস শালা,_\n" +
    "*জীবনে সফল হোস, টাকা কামাস, আর মাঝে মাঝে আমাদের কথা মনে করিস 😭💸❤️*\n" +
    "~আর ফিরে এসে 'Hi guys' দিলে block খাবি~ 🤣🔪\n" +
    "*Current Members:* `&size` 🫵🎀\n" +
    "&pp",

  "🥀💔 &mention 😭🫵🏻\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ MISSION ABORTED... MEMBER LEFT 💀*\n" +
    "_ভাই/বোন, group ছাড়ার এত শখ ছিল? 😭_\n" +
    "*আমরা কি তোকে rent চেয়েছিলাম নাকি? 🌚😂*\n" +
    "━━━━━━━━━━━━━━\n" +
    "*তুই চলে গেলি,*\n" +
    "_কিন্তু তোর message, তোর nonsense আর তোর পাগলামি রেখে গেলি_ 🥲💔\n" +
    "*এখন থেকে কে আমাদের মাথা খাবে?* 😭🤌\n" +
    "━━━━━━━━━━━━━━\n" +
    "`যাই হোক, জীবনটা সুন্দর করে কাটাস ❤️‍🩹`\n" +
    "*ভালো থাকিস, সুস্থ থাকিস,*\n" +
    "_আর কাউকে আমাদের মতো জ্বালাস না, বেচারা বাঁচবে না_ 🤣🔪\n" +
    "*Goodbye, পাগল! 🫶🌸*\n" +
    "~তবে সত্যি করে বল, কেন গেলি? 😭~\n" +
    "*Current Members:* `&size` 💔\n" +
    "&pp",

  "🌹⃝⃔ &mention 🥺💔\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ ONE LESS PROBLEM IN THE GROUP 😭🎉*\n" +
    "_অবশেষে একজন nuisance নিজে থেকেই বিদায় নিলো 🌚😂_\n" +
    "━━━━━━━━━━━━━━\n" +
    "*তোর presence ছিল headache,*\n" +
    "_কিন্তু তুই না থাকলে group-টা আবার অদ্ভুত quiet লাগে 🥹💔_\n" +
    "*এটাই হলো friendship-এর আসল curse 😭🤌*\n" +
    "━━━━━━━━━━━━━━\n" +
    "`তুই চলে গেলেও তোর নামের সাথে জড়িয়ে থাকা memories থাকবে 💗`\n" +
    "*তাই ভালো থাকিস রে শালা,*\n    " +
    "_জীবনে অনেক দূর যাস আর আমাদের ভুলে যাস না_ 🫶🌸\n" +
    "~আর যদি ভুলেও যাস, আমরাও তোকে ভুলব না... কারণ screenshot আছে~ 📸🤣\n" +
    "*Goodbye, legend! 👑💔*\n" +
    "*Current Members:* `&size` 🎀\n" +
    "&pp",

  "🫀💔 &mention 🫵🏻🥹\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ ADIOS, BHAI! 👋😂*\n" +
    "_তুই চলে গেলি... group-এর GDP একটু কমে গেল 😭💸_\n" +
    "*কিন্তু চিন্তা করিস না, আমরা বেঁচে আছি 🌚*\n" +
    "━━━━━━━━━━━━━━\n" +
    "*তোর সাথে কত হাসাহাসি, কত ঝগড়া, কত বাজে কথা...*\n" +
    "_সব এখন memories হয়ে গেল 🥹❤️‍🩹_\n" +
    "*সত্যি বলতে তুই একটা বিরক্তিকর পাগল ছিলি,*\n" +
    "_কিন্তু নিজের পাগল ছিলি_ 😭🫶\n" +
    "━━━━━━━━━━━━━━\n" +
    "`যেখানে থাকিস, ভালো থাকিস ❤️`\n" +
    "*নিজের খেয়াল রাখিস আর life-এ বড় কিছু করিস,*\n    " +
    "_যাতে একদিন আমরা বলতে পারি—এই গাধাটাকে আমরা চিনতাম_ 😭🤣\n" +
    "~Farewell, idiot~ 🥀😂\n" +
    "*Current Members:* `&size` 💔\n" +
    "&pp",

  "😂💔 &mention 🫵🏻\n" +
    "*𓂋⃝⃟⃟⃝⃪⃔ SYSTEM ALERT 🚨*\n" +
    "*User has successfully escaped the group! 🏃‍♂️💨*\n" +
    "_Reason: জানা যায়নি... সম্ভবত বুদ্ধি একটু বেশি হয়ে গেছে_ 🌚🤣\n" +
    "━━━━━━━━━━━━━━\n" +
    "*তুই ভাবলি group leave করলেই সব শেষ?* 😌\n" +
    "`ভাই, internet-এ memory বলে একটা জিনিস আছে 😭📸`\n" +
    "*তোর পুরোনো কাণ্ডকারখানা আমাদের database-এ নিরাপদে সংরক্ষিত আছে* 💀😂\n" +
    "━━━━━━━━━━━━━━\n" +
    "_মজা aside,_\n" +
    "*তুই ভালো থাকিস, নিজের স্বপ্নগুলো পূরণ করিস আর হাসিখুশি থাকিস ❤️‍🩹🌸*\n" +
    "*আমাদের পক্ষ থেকে শেষ কথা—*\n" +
    "`ভালো থাকিস শালা, আর বেশি ভাব নিস না 😭🤌`\n" +
    "~Goodbye & see you somewhere again! 🥹💞~\n" +
    "*Current Members:* `&size` 🫵🎀\n" +
    "&pp",
];

export function pickRandom(arr) {
  const index = crypto.randomInt(0, arr.length);
  return arr[index];
}
