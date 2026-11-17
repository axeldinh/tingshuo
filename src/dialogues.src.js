// Conversation scenes, played on the Conversation screen. One object per scene:
// { id, l: HSK level, title: Chinese title, en: English title, who: who the app plays, intro: the setting in one line,
//   start: first node, nodes: { key: [chinese, english, replies] } }
// A reply is [chinese, english, next node, [[distractor, why it's wrong] ×3], [other accepted wordings]?].
// The last line of a scene has 'end' instead of replies.
// Distractors are near-misses that are wrong in this context: one word, one tone, word order, one particle.
// Keep node keys stable: progress is stored per reply (c-<scene>-<node>-<n>).
// `npm run build` fails on unreachable nodes, dead ends, loops, missing glosses, and distractors equal to a reply;
// it warns on characters above the scene's HSK level (and `npm test` fails on them).
module.exports = [
// ================= HSK 1 =================
{ id: 'meet', l: 1, title: '认识一下', en: 'Meeting someone new', who: 'Xiaoyue', intro: 'At a friend’s party, a young woman comes over to say hello. You are Daming (大明).', start: 'hi', nodes: {
  hi: ['你好！我叫小月。你叫什么名字？', 'Hi! I’m Xiaoyue. What’s your name?', [
    ['我叫大明。', 'I’m Daming.', 'hy', [['我叫大明吗？', '吗 turns it into a question'], ['你叫大明。', '你 = you: that names her, not you'], ['我认识大明。', '认识 = to know someone: “I know Daming”']], ['我是大明。']],
    ['你好，我叫大明。认识你很高兴。', 'Hi, I’m Daming. Nice to meet you.', 'hy', [['你好，我叫大明。认识你很高。', '高 = tall; glad is 高兴'], ['你好，我叫大明。认识你不高兴。', '不高兴 = not pleased'], ['你好，我叫大明。认识我很高兴。', '认识我 = meeting me; it is meeting her that pleases you']]],
  ]],
  hy: ['你的汉语很好！你是学生吗？', 'Your Chinese is good! Are you a student?', [
    ['谢谢！是，我在这儿学习汉语。', 'Thanks! Yes, I’m studying Chinese here.', 'study', [['谢谢！是，我学习汉语在这儿。', '在这儿 goes before the verb'], ['不客气！是，我在这儿学习汉语。', '不客气 answers a thank-you; for a compliment say 谢谢'], ['谢谢！没，我在这儿学习汉语。', '是…吗 is answered with 是 or 不是, not 没']]],
    ['不是，我在这儿工作。', 'No, I work here.', 'job', [['没是，我在这儿工作。', '是 is negated with 不, never 没'], ['不是，我工作在这儿。', '在这儿 goes before the verb'], ['不是，我在这儿睡觉。', '睡觉 = sleep']]],
  ]],
  study: ['你学习汉语几年了？', 'How long have you been learning Chinese?', [
    ['一年了。', 'A year now.', 'live', [['一岁了。', '岁 counts age, not years of study'], ['一个年了。', '年 takes no measure word'], ['一月了。', '一月 = January']], ['我学了一年了。', '学了一年了。']],
    ['三个月了，我的汉语不太好。', 'Three months. My Chinese isn’t great.', 'live', [['三月了，我的汉语不太好。', '三月 = March; three months is 三个月'], ['三个月了，我的汉语太不好。', '“Not very good” is 不太好; 太不好 is “terrible”'], ['三个月了，我的汉语不太好吗？', '吗 turns it into a question']]],
  ]],
  job: ['你做什么工作？', 'What do you do?', [
    ['我是老师。', 'I’m a teacher.', 'live', [['我是学生。', '学生 = student; you just said you are not one'], ['我是老师吗？', '吗 turns it into a question'], ['我有老师。', '有 = have: “I have a teacher”']]],
    ['我是医生，在医院工作。', 'I’m a doctor. I work at a hospital.', 'live', [['我是医生，工作在医院。', '在医院 goes before the verb'], ['我是医院，在医生工作。', 'Swapped: 医生 = doctor, 医院 = hospital'], ['我有医生，在医院工作。', '有 = have: “I have a doctor”']]],
  ]],
  live: ['你住在哪儿？', 'Where do you live?', [
    ['我住在学校后面。', 'I live behind the school.', 'like', [['我住在后面学校。', 'The place comes first: 学校后面 = behind the school'], ['我坐在学校后面。', '坐 = sit'], ['我住在学生后面。', '学生 = student; school is 学校']], ['我住学校后面。']],
    ['我家在火车站前面。', 'My place is in front of the train station.', 'like', [['我家有火车站前面。', 'Where something is takes 在, not 有'], ['我家在火车前面。', '火车 = train; the station is 火车站'], ['我家是火车站前面。', 'Where something is takes 在, not 是']]],
  ]],
  like: ['你喜欢北京吗？', 'Do you like Beijing?', [
    ['很喜欢！北京很漂亮。', 'Very much! Beijing is beautiful.', 'tea', [['很喜欢！北京是漂亮。', 'Adjectives don’t take 是'], ['不喜欢！北京很漂亮。', '不喜欢 = don’t like, which clashes with 漂亮'], ['喜欢很！北京很漂亮。', '很 goes before the verb: 很喜欢']]],
    ['喜欢，北京菜很好吃。', 'Yes, the food in Beijing is delicious.', 'tea', [['喜欢，北京菜很好喝。', '好喝 is for drinks; food is 好吃'], ['喜欢，北京菜很吃好。', '好吃 is one word: 很好吃'], ['喜欢，北京茶很好吃。', '茶 = tea, which you drink']]],
  ]],
  tea: ['我们明天去喝茶，好吗？', 'Shall we go for tea tomorrow?', [
    ['好，明天几点？', 'Sure. What time tomorrow?', 'when', [['好，明天几岁？', '几岁 = how old'], ['好，昨天几点？', '昨天 = yesterday'], ['好，明天多少点？', 'Clock time is asked with 几点']]],
    ['对不起，明天我工作。', 'Sorry, I’m working tomorrow.', 'sat', [['没关系，明天我工作。', '没关系 = no problem; to say sorry use 对不起'], ['对不起，昨天我工作。', '昨天 = yesterday'], ['对不起，明天我没工作。', '没工作 = not working: then you are free']]],
  ]],
  when: ['下午三点，在学校前面的茶馆。', 'Three in the afternoon, at the teahouse in front of the school.', [
    ['好，明天下午三点见！', 'OK, see you tomorrow at three!', 'bye', [['好，明天上午三点见！', '上午 = morning; she said 下午'], ['好，明天见下午三点！', 'Time goes before the verb'], ['好，明天下午三点看见！', '看见 = to spot; “see you” is just 见']]],
    ['好的，明天见！', 'Great, see you tomorrow!', 'bye', [['好的，昨天见！', '昨天 = yesterday'], ['好的，见明天！', 'Time goes before the verb: 明天见'], ['好的，明天见吗？', '吗 turns it into a question']]],
  ]],
  sat: ['没关系。星期六下午呢？', 'No problem. How about Saturday afternoon?', [
    ['星期六下午很好！', 'Saturday afternoon is great!', 'bye', [['星期六上午很好！', '上午 = morning; she said 下午'], ['星期六下午是好！', 'Adjectives don’t take 是'], ['星期日下午很好！', '星期日 = Sunday; she said Saturday']]],
    ['好，星期六见！', 'OK, see you Saturday!', 'bye', [['好，六星期见！', '六星期 = six weeks; Saturday is 星期六'], ['好，星期六看见！', '看见 = to spot; “see you” is just 见'], ['好，星期见六！', '星期六 is one word: 星期六见']]],
  ]],
  bye: ['太好了，再见！', 'Great. Bye!', 'end'],
}},

{ id: 'food', l: 1, title: '在饭馆', en: 'At a restaurant', who: 'Waiter', intro: 'Lunchtime at a small restaurant. The waiter comes over.', start: 'hi', nodes: {
  hi: ['你好！几个人？', 'Hello! How many?', [
    ['一个人。', 'Just me.', 'sit', [['一人个。', 'The measure word goes in between: 一个人'], ['一本人。', '本 counts books'], ['一些人。', '一些 = some (people)']], ['我一个人。']],
    ['三个人。', 'Three of us.', 'sit', [['三个人们。', '们 is never used with a number'], ['三岁人。', '岁 counts age'], ['三人个。', 'The measure word goes in between: 三个人']], ['我们三个人。']],
  ]],
  sit: ['请坐。你想吃什么？', 'Have a seat. What would you like to eat?', [
    ['我想吃米饭和这个菜。', 'I’d like rice and this dish.', 'drink', [['我想喝米饭和这个菜。', '喝 = drink; rice and dishes are eaten'], ['我吃想米饭和这个菜。', '想 goes before the verb: 想吃'], ['我想吃米饭和这本菜。', '菜 takes 个, not 本']]],
    ['你们这儿什么菜好吃？', 'What’s good here?', 'rec', [['你们这儿什么菜好吃吗？', 'Question-word questions don’t take 吗'], ['你们这儿什么菜好喝？', '好喝 is for drinks'], ['你们这儿什么菜吃好？', '好吃 is one word: 什么菜好吃']]],
  ]],
  rec: ['这个菜很好吃，很多人都喜欢。', 'This one’s very good. Lots of people like it.', [
    ['好，我想吃这个。', 'OK, I’ll have that.', 'drink', [['好，我想喝这个。', '喝 = drink; a dish is eaten'], ['好，我想这个吃。', 'The verb comes before the object: 想吃这个'], ['好，我不想吃这个。', '不想 = don’t want, which clashes with 好']], ['好，我吃这个。']],
    ['好，我想吃这个菜和米饭。', 'OK, that dish with rice, please.', 'drink', [['好，我想吃这个菜在米饭。', '和 = and; 在 = at'], ['好，我吃想这个菜和米饭。', '想 goes before the verb: 想吃'], ['好，我想吃这个菜和米饭了。', '了 doesn’t go on a wish like 想吃']]],
  ]],
  drink: ['你想喝什么？', 'What would you like to drink?', [
    ['我想喝茶。', 'I’d like tea.', 'taste', [['我想吃茶。', 'Drinks take 喝'], ['我想茶喝。', 'The verb comes before the object: 喝茶'], ['我想喝菜。', '菜 = a dish']]],
    ['一杯水，谢谢。', 'A glass of water, thanks.', 'taste', [['一个水，谢谢。', 'Water in a glass takes 杯'], ['一杯水，不客气。', '不客气 answers a thank-you; you are the one thanking'], ['一杯水，对不起。', '对不起 = sorry; you mean thanks']]],
    ['不想喝，谢谢。', 'Nothing, thanks.', 'taste', [['没想喝，谢谢。', 'Wishes are negated with 不'], ['不想吃，谢谢。', '吃 = eat; he asked about drinks'], ['不想喝，没关系。', '没关系 answers an apology']]],
  ]],
  taste: ['你的菜来了。怎么样？好吃吗？', 'Here’s your food. How is it? Good?', [
    ['很好吃！', 'Delicious!', 'fruit', [['很好喝！', '好喝 is for drinks'], ['很吃好！', '好吃 is one word'], ['很好吃吗？', '吗 turns it into a question']], ['太好吃了！', '好吃！']],
    ['好吃！我很喜欢这个菜。', 'Yes! I really like this dish.', 'fruit', [['好喝！我很喜欢这个菜。', '好喝 is for drinks'], ['好吃！我喜欢很这个菜。', '很 goes before the verb: 很喜欢'], ['好吃！我很喜欢这本菜。', '菜 takes 个, not 本']]],
  ]],
  fruit: ['你想吃水果吗？', 'Would you like some fruit?', [
    ['不吃了，谢谢。多少钱？', 'No more, thanks. How much is it?', 'bill', [['没吃了，谢谢。多少钱？', '“Not any more” is 不…了'], ['不吃了，谢谢。几钱？', 'Prices are asked with 多少钱'], ['不吃了，谢谢。多少钱吗？', 'Question-word questions don’t take 吗']]],
    ['好，我想吃一个苹果。', 'Yes, I’d like an apple.', 'apple', [['好，我想吃一本苹果。', 'Apples take 个'], ['好，我想喝一个苹果。', '喝 = drink'], ['好，我想一个苹果吃。', 'The verb comes before the object: 吃一个苹果']]],
  ]],
  apple: ['好。这个苹果是我请你的！', 'Here you are. The apple’s on me!', [
    ['谢谢！多少钱？', 'Thank you! How much do I owe?', 'bill', [['不客气！多少钱？', '不客气 answers a thank-you; he is the one being kind'], ['谢谢！几钱？', 'Prices are asked with 多少钱'], ['谢谢！多少钱了？', '了 is out of place: 多少钱']]],
    ['太谢谢你了！我想看看多少钱。', 'Thanks so much! Could I see how much it is?', 'bill', [['太谢谢你！我想看看多少钱。', '太…了 go together: 太谢谢你了'], ['太谢谢你了！我想看见多少钱。', '看见 = to spot; “have a look” is 看看'], ['太谢谢你了！我想看看几钱。', 'Prices are asked with 多少钱']]],
  ]],
  bill: ['不客气。三十五块钱。', 'You’re welcome. That’s thirty-five yuan.', [
    ['好，这是四十块钱。', 'OK, here’s forty.', 'end', [['好，这是十四块钱。', '十四 = fourteen: not enough'], ['好，这是四十个钱。', 'Money is counted in 块'], ['好，这些四十块钱。', '这些 = these; “here is” is 这是']]],
    ['好，这是三十五块。', 'OK, here’s thirty-five.', 'end', [['好，这是五十三块。', '五十三 = fifty-three'], ['好，这是三五十块。', 'Thirty-five is 三十五'], ['好，这是三十五本。', 'Money is counted in 块']]],
  ]],
  end: ['谢谢！再见！', 'Thank you! Goodbye!', 'end'],
}},

{ id: 'fruit', l: 1, title: '买水果', en: 'Buying fruit', who: 'Stall owner', intro: 'A fruit stall near your home. The owner calls out to you.', start: 'hi', nodes: {
  hi: ['你好！想买点儿什么？', 'Hello! What can I get you?', [
    ['我想买苹果。', 'I’d like some apples.', 'taste', [['我想买苹果吗？', '吗 turns it into a question'], ['我买想苹果。', '想 goes before the verb: 想买'], ['我想买苹果们。', '们 is only for people']]],
    ['你好！有苹果吗？', 'Hello! Do you have apples?', 'taste', [['你好！是苹果吗？', '是 = is it; to ask if they have any, use 有'], ['你好！有苹果呢？', 'A yes/no question takes 吗'], ['你好！有苹果什么？', '什么 = what; this is a yes/no question']]],
  ]],
  taste: ['有！你先吃一个，很好吃。', 'Sure! Try one first, they’re really good.', [
    ['谢谢！很好吃。多少钱一个？', 'Thanks! Delicious. How much each?', 'price', [['谢谢！很好喝。多少钱一个？', '好喝 is for drinks'], ['不客气！很好吃。多少钱一个？', '不客气 answers a thank-you'], ['谢谢！很好吃。几钱一个？', 'Prices are asked with 多少钱']]],
    ['不吃了，谢谢。苹果多少钱一个？', 'I’m fine, thanks. How much is an apple?', 'price', [['没吃了，谢谢。苹果多少钱一个？', '“No, I won’t” is 不…了'], ['不吃了，谢谢。苹果多少钱一本？', 'Apples take 个'], ['不吃了，谢谢。苹果多少钱一个吗？', 'Question-word questions don’t take 吗']]],
  ]],
  price: ['三块钱一个。', 'Three yuan each.', [
    ['我买三个。', 'I’ll take three.', 'b9', [['我买三岁。', '岁 counts age'], ['我买三本。', '本 counts books; apples take 个'], ['我买个三。', 'The number goes before the measure word: 三个']], ['我想买三个。', '三个。']],
    ['我想买五个。', 'I’d like five.', 'b15', [['我想买五点。', '五点 = five o’clock'], ['我想五个买。', 'The verb comes before what you buy: 买五个'], ['我想买五杯。', '杯 counts cups']], ['我买五个。', '五个。']],
  ]],
  b9: ['好。三个，九块钱。', 'OK. Three, that’s nine yuan.', [
    ['好，这是九块钱。', 'OK, here’s nine yuan.', 'chat', [['好，这是六块钱。', '六 = six; it costs nine'], ['好，这是九个钱。', 'Money is counted in 块'], ['好，这些九块钱。', '这些 = these; “here is” is 这是']]],
    ['好的，谢谢！', 'OK, thank you!', 'chat', [['好的，不客气！', '不客气 answers a thank-you; you are the one thanking'], ['好的，对不起！', '对不起 = sorry'], ['好的，没关系！', '没关系 answers an apology']]],
  ]],
  b15: ['好。五个，十五块钱。', 'OK. Five, that’s fifteen yuan.', [
    ['好，这是十五块钱。', 'OK, here’s fifteen yuan.', 'chat', [['好，这是五十块钱。', '五十 = fifty; it costs fifteen'], ['好，这是十五个钱。', 'Money is counted in 块'], ['好，这些十五块钱。', '这些 = these; “here is” is 这是']]],
    ['好的，谢谢！', 'OK, thank you!', 'chat', [['好的，不客气！', '不客气 answers a thank-you; you are the one thanking'], ['好的，对不起！', '对不起 = sorry'], ['好的，没关系！', '没关系 answers an apology']]],
  ]],
  chat: ['谢谢！你的汉语很好。你住在这儿吗？', 'Thanks! Your Chinese is good. Do you live around here?', [
    ['谢谢！我住在前面。', 'Thanks! I live just up the road.', 'tmr', [['不客气！我住在前面。', '不客气 answers a thank-you; for a compliment say 谢谢'], ['谢谢！我住前面在。', '在 goes before the place: 住在前面'], ['谢谢！我坐在前面。', '坐 = sit']]],
    ['不，我住在学校里面。', 'No, I live at the school.', 'tmr', [['没，我住在学校里面。', '没 negates what happened; for “no, I don’t” say 不'], ['不，我住在学生里面。', '学生 = student; school is 学校'], ['不，我住学校在里面。', '在 goes before the place: 住在学校里面']]],
  ]],
  tmr: ['那你明天再来！', 'Come again tomorrow, then!', [
    ['好，明天见！', 'Sure, see you tomorrow!', 'end', [['好，昨天见！', '昨天 = yesterday'], ['好，明天看见！', '看见 = to spot; “see you” is just 见'], ['好，见明天！', 'Time goes before the verb: 明天见']]],
    ['好的，谢谢，再见！', 'Will do. Thanks, bye!', 'end', [['好的，不客气，再见！', '不客气 answers a thank-you'], ['好的，对不起，再见！', '对不起 = sorry'], ['好的，谢谢，你好！', '你好 = hello; you are leaving']]],
  ]],
  end: ['再见！', 'Bye!', 'end'],
}},

{ id: 'call', l: 1, title: '打电话', en: 'A phone call', who: 'Xiaoyue', intro: 'You call your friend Xiaoyue to ask her to the cinema. You are Daming (大明).', start: 'hi', nodes: {
  hi: ['喂，你好！', 'Hello?', [
    ['喂，小月，我是大明。', 'Hi Xiaoyue, it’s Daming.', 'doing', [['喂，小月，你是大明。', '你是 = you are; it is you who are Daming'], ['再见，小月，我是大明。', '再见 = goodbye'], ['喂，小月，我是大明吗？', '吗 turns it into a question']]],
    ['喂，是小月吗？', 'Hello, is that Xiaoyue?', 'doing', [['喂，是小月呢？', 'A yes/no question takes 吗'], ['喂，在小月吗？', '“Is that…?” is 是…吗'], ['喂，是小月的吗？', '的 makes it “is it Xiaoyue’s?”']]],
  ]],
  doing: ['大明，你好！你在做什么？', 'Hi Daming! What are you up to?', [
    ['我在家看电视。你呢？', 'Watching TV at home. You?', 'me', [['我在家看电话。你呢？', '电话 = phone; TV is 电视'], ['我看电视在家。你呢？', '在家 goes before the verb'], ['我在家看电视。你吗？', '“And you?” is 你呢']]],
    ['我在学习汉语。你呢？', 'Studying Chinese. You?', 'me', [['我学习在汉语。你呢？', '在 goes before the verb for an action in progress'], ['我在学校汉语。你呢？', '学校 = school; study is 学习'], ['我在学习汉语。你吗？', '“And you?” is 你呢']]],
  ]],
  me: ['我在看书。怎么了？', 'Reading. What’s up?', [
    ['明天我们去看电影，好吗？', 'Shall we go see a film tomorrow?', 'free', [['明天我们去看电视，好吗？', '电视 = TV; a film is 电影'], ['明天我们看去电影，好吗？', '去 comes before the verb: 去看电影'], ['昨天我们去看电影，好吗？', '昨天 = yesterday']]],
    ['你明天下午想去看电影吗？', 'Do you want to see a film tomorrow afternoon?', 'free', [['你下午明天想去看电影吗？', 'Bigger time first: 明天下午'], ['你明天下午想去看电脑吗？', '电脑 = computer'], ['你明天下午想去看电影呢？', 'A yes/no question takes 吗']]],
  ]],
  free: ['好！明天上午我工作，下午能去。几点？', 'Sure! I work in the morning, but I can go in the afternoon. What time?', [
    ['下午三点，怎么样？', 'Three in the afternoon, how’s that?', 'where', [['下午三点，怎么了？', '怎么了 = what’s wrong?'], ['三点下午，怎么样？', 'Bigger time first: 下午三点'], ['下午三分，怎么样？', '分 = minutes; hours are 点']]],
    ['你几点能来？', 'What time can you make it?', 'four', [['你几点能来吗？', 'Question-word questions don’t take 吗'], ['你几岁能来？', '几岁 = how old'], ['你多少点能来？', 'Clock time is asked with 几点']]],
  ]],
  four: ['四点，怎么样？', 'Four o’clock, how’s that?', [
    ['四点很好！', 'Four is great!', 'where', [['十点很好！', '十 shí = ten; she said 四 sì, four'], ['四点是好！', 'Adjectives don’t take 是'], ['四分很好！', '分 = minutes; hours are 点']]],
    ['好的，下午四点。', 'OK, four in the afternoon.', 'where', [['好的，上午四点。', '上午 = morning'], ['好的，下午十点。', '十 shí = ten; she said 四 sì, four'], ['好的，四点下午。', 'Bigger time first: 下午四点']]],
  ]],
  where: ['好！我们在哪儿见？', 'Great! Where shall we meet?', [
    ['在电影院前面见。', 'In front of the cinema.', 'bye', [['在电影院前面再见。', '再见 = goodbye; “meet” is just 见'], ['见在电影院前面。', '在 + place goes before the verb'], ['在电影院前面看见。', '看见 = to spot; “meet” is just 见']]],
    ['我去你家，好吗？', 'I’ll come by your place, OK?', 'bye', [['我去你家，好呢？', 'The tag question is 好吗'], ['我去我家，好吗？', '我家 = my place'], ['我回你家，好吗？', '回 = go back home; to visit, use 去']]],
  ]],
  bye: ['太好了！我很想看这个电影。', 'Great! I’ve really wanted to see this one.', [
    ['我很喜欢看电影。明天见！', 'I love films. See you tomorrow!', 'end', [['我很喜欢看电影。昨天见！', '昨天 = yesterday'], ['我喜欢很看电影。明天见！', '很 goes before 喜欢'], ['我很喜欢看电影。明天看见！', '看见 = to spot; “see you” is just 见']]],
    ['好的，明天见！', 'OK, see you tomorrow!', 'end', [['好的，昨天见！', '昨天 = yesterday'], ['好的，见明天！', 'Time goes before the verb: 明天见'], ['好的，明天见吗？', '吗 turns it into a question']]],
  ]],
  end: ['明天见！', 'See you tomorrow!', 'end'],
}},

// ================= HSK 2 =================
{ id: 'way', l: 2, title: '问路', en: 'Asking the way', who: 'Passer-by', intro: 'You are looking for the train station. A woman sees you checking your phone.', start: 'hi', nodes: {
  hi: ['你好，你要去哪儿？', 'Hi, where are you trying to get to?', [
    ['我要去火车站。', 'I’m going to the train station.', 'far', [['我要去火车。', '火车 = train; the station is 火车站'], ['我去要火车站。', '要 goes before 去'], ['我要来火车站。', '来 = come (towards here); going there is 去']]],
    ['请问，火车站怎么走？', 'Excuse me, how do I get to the train station?', 'far', [['请问，火车站怎么样？', '怎么样 = how is it'], ['请问，火车站怎么走吗？', 'Question-word questions don’t take 吗'], ['请问，火车站走怎么？', '怎么 goes before the verb: 怎么走']]],
  ]],
  far: ['火车站？不远，走路十分钟。', 'The station? It’s not far, ten minutes on foot.', [
    ['太好了！怎么走？', 'Great! Which way?', 'dir', [['太好了！怎么样走？', '怎么样 = how is it; “which way” is 怎么走'], ['太好了！走怎么？', '怎么 goes before the verb'], ['太好的！怎么走？', '“Great!” is 太好了']]],
    ['可以坐公共汽车吗？', 'Can I take a bus?', 'bus', [['可以开公共汽车吗？', '开 = drive'], ['可以公共汽车坐吗？', '坐 comes before the vehicle'], ['可以坐公共汽车呢？', 'A yes/no question takes 吗']]],
  ]],
  bus: ['可以，但是坐车也要十分钟。', 'You can, but the bus takes ten minutes too.', [
    ['那我走路去吧。', 'Then I’ll walk.', 'dir', [['那我路走去吧。', '走路 = walk: 走路去'], ['那我坐路去吧。', '走路 = walk; 坐 is for vehicles'], ['那我走路去了。', '了 says you already went; 吧 makes it a decision']]],
    ['好，那我走路去。怎么走？', 'OK, I’ll walk then. Which way?', 'dir', [['好，那我走路去。怎么样？', '怎么样 = how is it'], ['好，那我走去路。怎么走？', 'Word order: 走路去'], ['好，那我走路去。走怎么？', '怎么 goes before the verb']]],
  ]],
  dir: ['你从这儿向前走，火车站在右边。', 'Go straight ahead from here. The station is on the right.', [
    ['向前走，在右边，对吗？', 'Straight ahead, on the right, yes?', 'near', [['向前走，在左边，对吗？', '左边 = left; she said right'], ['向后走，在右边，对吗？', '向后 = backwards'], ['向前走，在右边，对不对吗？', '对不对 is already a question; no 吗']]],
    ['在那个商店旁边吗？', 'Is it next to that shop?', 'near', [['在那个商店边旁吗？', 'The word is 旁边'], ['在那个商店身边吗？', '身边 is for people'], ['在那个商店近吗？', '近 = near is an adjective: 离商店近']]],
  ]],
  near: ['对，就在商店旁边。你是第一次来这儿吗？', 'Yes, right next to the shop. Is this your first time here?', [
    ['是，我是第一次来。', 'Yes, it’s my first time.', 'from', [['是，我是一次来。', '“The first time” is 第一次'], ['是，我是第一个来。', '第一个 = the first person to arrive'], ['是，我是第一次去。', '去 = go; you are here, so 来']]],
    ['不是，我去年来北京旅游了。', 'No, I came here on holiday last year.', 'from', [['不是，我明年来北京旅游了。', '明年 = next year'], ['不是，我去年旅游来北京了。', '来北京 comes first: 来北京旅游'], ['不是，我去年来北京游泳了。', '游泳 = swim']]],
  ]],
  from: ['欢迎！你去火车站做什么？', 'Welcome! What are you going to the station for?', [
    ['我去买火车票。', 'To buy a train ticket.', 'bye', [['我去卖火车票。', '卖 mài = sell; buy is 买 mǎi'], ['我去买火车站。', '火车站 = the station itself'], ['我买去火车票。', '去 comes before the verb: 去买票']]],
    ['我朋友今天来北京。', 'A friend is arriving in Beijing today.', 'bye', [['我朋友今天去北京。', '去 = go away; arriving here is 来'], ['我朋友今天北京来。', '来 comes before the place: 来北京'], ['我朋友昨天来北京。', '昨天 = yesterday; then why go to the station now?']]],
  ]],
  bye: ['好。快去吧！', 'Right. Off you go!', [
    ['谢谢您！', 'Thank you!', 'end', [['不客气！', '不客气 answers a thank-you'], ['对不起！', '对不起 = sorry'], ['没关系！', '没关系 answers an apology']], ['谢谢！', '谢谢你！']],
    ['太谢谢你了，再见！', 'Thanks so much, bye!', 'end', [['太谢谢你，再见！', '太…了 go together: 太谢谢你了'], ['太谢谢你了，你好！', '你好 = hello; you are leaving'], ['太对不起了，再见！', '对不起 = sorry']]],
  ]],
  end: ['不客气！', 'You’re welcome!', 'end'],
}},

{ id: 'ticket', l: 2, title: '买火车票', en: 'Buying a train ticket', who: 'Ticket clerk', intro: 'At the ticket window of a small station outside the city. You want to go to Beijing.', start: 'hi', nodes: {
  hi: ['您好！去哪儿？', 'Hello! Where to?', [
    ['您好，我去北京。', 'Hello, to Beijing please.', 'when', [['您好，我来北京。', '来 = come here; going there is 去'], ['您好，我是北京。', '是 = am: “I am Beijing”'], ['您好，我北京去。', '去 comes before the place: 去北京']], ['去北京。', '我要去北京。']],
    ['我要一张去北京的票。', 'One ticket to Beijing, please.', 'when', [['我要一个去北京的票。', 'Tickets take 张'], ['我要一张去北京票的。', '的 goes before 票: 去北京的票'], ['我要一张来北京的票。', '来 = come; the ticket takes you there: 去']]],
  ]],
  when: ['几点的？现在有十点的和十二点的。', 'What time? There’s a ten o’clock and a twelve o’clock.', [
    ['十点的。', 'The ten o’clock.', 'price', [['四点的。', '四 sì = four; she said 十 shí, ten'], ['十分的。', '分 = minutes; hours are 点'], ['十点了。', '十点了 = it is ten now; the ten o’clock one is 十点的']], ['我要十点的。']],
    ['十二点的，还有票吗？', 'The twelve o’clock. Are there tickets left?', 'price', [['二十点的，还有票吗？', '二十点 = 20:00; she said 十二点'], ['十二点的，还是票吗？', '还是 = or; “any left” is 还有'], ['十二点的，有还票吗？', '还 goes before 有: 还有']]],
    ['哪个快？', 'Which one is faster?', 'fast', [['哪个快吗？', 'Question-word questions don’t take 吗'], ['哪个快乐？', '快乐 = happy'], ['那个快？', '那个 nàge = that one; which is 哪个 nǎge']]],
  ]],
  fast: ['十二点的快，两个小时就到。', 'The twelve o’clock is faster, you’re there in two hours.', [
    ['好，我要十二点的。', 'OK, I’ll take the twelve o’clock.', 'price', [['好，我要十二点了。', '十二点了 = it is twelve now'], ['好，我要二十点的。', '二十 = twenty'], ['好，我要十二个的。', '个 counts things; the time is 十二点']]],
    ['那我买十二点的。', 'Then I’ll buy the twelve o’clock.', 'price', [['那我卖十二点的。', '卖 mài = sell; buy is 买 mǎi'], ['那买我十二点的。', '我 goes before the verb'], ['那我买十二点。', 'Without 的 you are buying “twelve o’clock”']]],
  ]],
  price: ['好的，一百二十块。', 'OK, that’s a hundred and twenty yuan.', [
    ['好，给您。', 'Sure, here you go.', 'paid', [['好，送您。', '送 = give as a present'], ['好，您给。', '给 comes before the person: 给您'], ['好，给我。', '给我 = give it to me']]],
    ['学生票多少钱？', 'How much is a student ticket?', 'student', [['学生票几钱？', 'Prices are asked with 多少钱'], ['学生票多少钱吗？', 'Question-word questions don’t take 吗'], ['学校票多少钱？', '学校 = school; a student ticket is 学生票']]],
  ]],
  student: ['学生票便宜一点儿，九十块。', 'Student tickets are a bit cheaper: ninety.', [
    ['太好了，我是学生！', 'Great, I’m a student!', 'paid', [['太好了，我是老师！', '老师 = teacher: no student price then'], ['太好了，我是学校！', '学校 = school'], ['太好了，我不是学生！', '不是 = am not: no student price then']]],
    ['好，这是九十块。', 'OK, here’s ninety.', 'paid', [['好，这是十九块。', '十九 = nineteen'], ['好，这是九十张。', '张 counts tickets; money is 块'], ['好，这些九十块。', '这些 = these; “here is” is 这是']]],
  ]],
  paid: ['好，这是您的票。', 'Here’s your ticket.', [
    ['谢谢！在哪儿上车？', 'Thanks! Where do I get on?', 'board', [['谢谢！在哪儿下车？', '下车 = get off'], ['谢谢！哪儿在上车？', '在哪儿 goes before the verb'], ['谢谢！在哪儿上课？', '上课 = go to class']]],
    ['谢谢！车上能吃东西吗？', 'Thanks! Can I eat on the train?', 'food', [['谢谢！车上会吃东西吗？', '会 = know how; “is it allowed” is 能'], ['谢谢！能车上吃东西吗？', 'The place comes first: 车上能吃'], ['谢谢！车上能吃东西呢？', 'A yes/no question takes 吗']]],
  ]],
  board: ['从那个门进去，在左边。', 'Go in through that gate, it’s on the left.', [
    ['好的，我知道了。', 'OK, got it.', 'more', [['好的，我不知道了。', '不知道 = don’t know'], ['好的，我认识了。', '认识 = get to know someone; “got it” is 我知道了'], ['好的，我告诉了。', '告诉 = tell someone']]],
    ['左边？是那个门吗？', 'On the left? Through that gate?', 'more', [['右边？是那个门吗？', '右边 = right; she said left'], ['左边？是哪个门吗？', '哪个 already asks “which”, so no 吗'], ['左边？是那个门呢？', 'A yes/no question takes 吗']]],
  ]],
  food: ['能，车上也能买饭。', 'Yes, and you can buy food on board.', [
    ['太好了，谢谢！', 'Great, thanks!', 'more', [['太好了，不客气！', '不客气 answers a thank-you'], ['太好的，谢谢！', '“Great!” is 太好了'], ['太好了，对不起！', '对不起 = sorry']]],
    ['好，那我在车上吃饭。', 'OK, then I’ll eat on the train.', 'more', [['好，那我在车上吃饭了。', '了 says you already ate; this is a plan'], ['好，那我吃饭在车上。', '在车上 goes before the verb'], ['好，那我在车下吃饭。', '车下 = off the train']]],
  ]],
  more: ['还有问题吗？', 'Anything else?', [
    ['没有了，谢谢您！', 'No, that’s all. Thank you!', 'end', [['不有了，谢谢您！', '有 is negated with 没'], ['没有了，不客气！', '不客气 answers a thank-you'], ['没有吗，谢谢您！', '吗 turns it into a question']]],
    ['没有了，再见！', 'No, that’s it. Bye!', 'end', [['没有了，你好！', '你好 = hello; you are leaving'], ['没问题了，再见！', '没问题 = no problem; “no more questions” is 没有了'], ['没有了，再来！', '再来 = come again; goodbye is 再见']]],
  ]],
  end: ['不客气，再见！', 'You’re welcome. Goodbye!', 'end'],
}},

{ id: 'plans', l: 2, title: '一起玩儿', en: 'Making plans', who: 'Xiaoxue', intro: 'After class, your classmate Xiaoxue catches up with you.', start: 'hi', nodes: {
  hi: ['星期六你有时间吗？', 'Are you free on Saturday?', [
    ['有，怎么了？', 'Yes, why?', 'play', [['有，怎么样？', '怎么样 = how about it; “why, what’s up?” is 怎么了'], ['是，怎么了？', '“Are you free?” is answered with 有, not 是'], ['有，什么了？', '“What’s up?” is 怎么了']]],
    ['上午有课，下午有时间。', 'I have class in the morning, but I’m free in the afternoon.', 'play', [['上午有课，下午有时候。', '时候 = a point in time; free time is 时间'], ['上午有课，下午没有时间。', '没有时间 = not free; then you can’t go'], ['上午是课，下午有时间。', '“Have class” is 有课']]],
  ]],
  play: ['我们去打篮球吧！', 'Let’s go and play basketball!', [
    ['好！在哪儿打？', 'Sure! Where?', 'where', [['好！在哪儿踢？', '踢 = kick: that is for football'], ['好！在哪儿打电话？', '打电话 = make a phone call'], ['好！哪儿在打？', '在哪儿 goes before the verb']]],
    ['我不会打篮球，我们去游泳吧。', 'I can’t play basketball. Let’s go swimming instead.', 'swim', [['我没会打篮球，我们去游泳吧。', '会 is negated with 不'], ['我不会打篮球，我们去游泳了。', '了 says you already went; 吧 suggests'], ['我不会踢篮球，我们去游泳吧。', 'Basketball is 打, not 踢']]],
  ]],
  where: ['就在学校旁边，人不多。', 'Right next to school. It’s never crowded.', [
    ['好，离我家很近。', 'Great, that’s close to my place.', 'time', [['好，从我家很近。', 'Distance takes 离, not 从'], ['好，我家离很近。', '离 comes before the place: 离我家很近'], ['好，离我家很远。', '远 = far, which doesn’t fit 好']]],
    ['太好了！', 'Perfect!', 'time', [['太好！', '太…了 go together: 太好了'], ['好太了！', '太 goes before 好'], ['太好的！', '“Great!” is 太好了']]],
  ]],
  swim: ['游泳也很好！你游得快吗？', 'Swimming works too! Are you a fast swimmer?', [
    ['不快，我游得很慢。', 'No, I’m pretty slow.', 'time', [['不快，我游很慢。', 'Saying how well you do something needs 得: 游得很慢'], ['不快，我游得很快。', '很快 = fast, which clashes with 不快'], ['不快，我得游很慢。', '得 goes after the verb: 游得']]],
    ['还可以，你呢？', 'Not bad. You?', 'time', [['还可以，你吗？', '“And you?” is 你呢'], ['可以还，你呢？', '还 goes first: 还可以'], ['还可能，你呢？', '可能 = maybe; “not bad” is 还可以']]],
  ]],
  time: ['那我们下午两点去，怎么样？', 'So shall we go at two in the afternoon?', [
    ['两点太早了，三点吧。', 'Two’s a bit early. How about three?', 'after', [['两点太晚了，三点吧。', '晚 = late; then three would be even later'], ['二点太早了，三点吧。', 'Two o’clock is 两点, never 二点'], ['两点早太了，三点吧。', '太 goes before the adjective: 太早了']]],
    ['好，两点在学校前面见。', 'OK, two o’clock in front of the school.', 'after', [['好，两点在学校前面看见。', '看见 = to spot; “meet” is just 见'], ['好，两点见在学校前面。', '在 + place goes before the verb'], ['好，二点在学校前面见。', 'Two o’clock is 两点, never 二点']]],
  ]],
  after: ['好！完了以后我们一起去吃饭吧？', 'Great! Shall we get something to eat afterwards?', [
    ['好，我请你吃饭！', 'Sure, my treat!', 'treat', [['好，我请你喝饭！', '饭 is eaten: 吃饭'], ['好，我请吃你饭！', 'Word order: 请你吃饭'], ['好，我让你吃饭！', '让 = let; to treat someone is 请']]],
    ['对不起，晚上我有事。', 'Sorry, I’ve got something on in the evening.', 'busy', [['没关系，晚上我有事。', '没关系 = no problem; to apologise use 对不起'], ['对不起，晚上我是事。', '“Have something on” is 有事'], ['对不起，早上我有事。', '早上 = morning; dinner is in the evening']]],
  ]],
  treat: ['真的吗？谢谢！你想吃什么？', 'Really? Thanks! What do you feel like?', [
    ['我们去吃北京菜吧。', 'Let’s have Beijing food.', 'end1', [['我们去喝北京菜吧。', '菜 is eaten: 吃'], ['我们去吃北京菜了。', '了 says you already went; 吧 suggests'], ['我们吃去北京菜吧。', '去 comes before the verb: 去吃']]],
    ['你说吧，我都喜欢。', 'You choose, I like everything.', 'end1', [['你说吧，我都不喜欢。', '都不喜欢 = like nothing'], ['你说吧，我喜欢都。', '都 goes before the verb'], ['你说吗，我都喜欢。', '吧 hands her the choice; 吗 asks a question']]],
  ]],
  busy: ['没关系。我们星期天去吃饭，好吗？', 'No problem. Let’s eat on Sunday then, OK?', [
    ['好，星期天见！', 'Sure, see you Sunday!', 'end2', [['好，昨天见！', '昨天 = yesterday'], ['好，见星期天！', 'Time goes before the verb'], ['好，星期天看见！', '看见 = to spot; “see you” is just 见']]],
    ['星期天可以，几点？', 'Sunday works. What time?', 'end2', [['星期天可能，几点？', '可能 = maybe; “works for me” is 可以'], ['星期天可以，几岁？', '几岁 = how old'], ['星期天可以，多少点？', 'Clock time is asked with 几点']]],
  ]],
  end1: ['好！那星期六见！', 'Great! See you Saturday, then!', 'end'],
  end2: ['那星期天中午吧。星期六见！', 'Sunday at noon, then. See you Saturday!', 'end'],
}},

{ id: 'clothes', l: 2, title: '买衣服', en: 'Buying clothes', who: 'Shop assistant', intro: 'A small clothes shop. A jacket in the window caught your eye.', start: 'hi', nodes: {
  hi: ['欢迎！您想买什么？', 'Welcome! What are you looking for?', [
    ['我想看看这件衣服。', 'I’d like to look at this one.', 'color', [['我想看见这件衣服。', '看见 = to spot; “have a look” is 看看'], ['我想看看这张衣服。', '衣服 takes 件; 张 is for flat things like tickets'], ['我看看想这件衣服。', '想 goes before the verb']]],
    ['你好，我想买一件衣服。', 'Hi, I’m looking for a jacket.', 'color', [['你好，我想卖一件衣服。', '卖 mài = sell; buy is 买 mǎi'], ['你好，我想买一个衣服。', '衣服 takes 件'], ['你好，我想买一件衣服吗？', '吗 turns it into a question']]],
  ]],
  color: ['这件有红的、白的和黑的。您喜欢什么颜色？', 'This one comes in red, white and black. Which colour do you like?', [
    ['我喜欢红的。', 'I like the red one.', 'try', [['我喜欢红。', 'Say 红的 (the red one) or 红色'], ['我欢喜红的。', 'The word is 喜欢'], ['我喜欢红的吗？', '吗 turns it into a question']], ['红的。', '我喜欢红色的。']],
    ['黑的，我喜欢黑色。', 'Black. I like black.', 'try', [['黑的，我喜欢白色。', '白色 = white'], ['黑的，我不喜欢黑色。', '不喜欢 = don’t like: then why pick black?'], ['黑的，我喜欢黑的色。', 'Say 黑色 or 黑的, not both']]],
  ]],
  try: ['好，您试试吧。', 'Sure, try it on.', [
    ['有点儿小，有大一点儿的吗？', 'It’s a bit small. Do you have a bigger one?', 'big', [['有点儿大，有大一点儿的吗？', '有点儿大 = a bit big: then you’d want a smaller one'], ['有点儿小，有一点儿大的吗？', '一点儿 goes after the adjective: 大一点儿'], ['一点儿小，有大一点儿的吗？', '“A bit too” before an adjective is 有点儿']]],
    ['很好，我很喜欢！多少钱？', 'It’s good, I love it! How much is it?', 'price', [['很好，我喜欢很！多少钱？', '很 goes before the verb'], ['很好，我很欢喜！多少钱？', 'The word is 喜欢'], ['很好，我很喜欢！多少钱吗？', 'Question-word questions don’t take 吗']]],
  ]],
  big: ['有，这件大一点儿，您再试试。', 'Yes, this one’s a bit bigger. Try it on.', [
    ['这件正好！多少钱？', 'This one fits! How much is it?', 'price', [['这件正在！多少钱？', '正在 = in the middle of doing; “just right” is 正好'], ['这件太小！多少钱？', '太小 = too small'], ['这件正好！几钱？', 'Prices are asked with 多少钱']]],
    ['好，我穿这件。多少钱？', 'OK, I’ll take this one. How much?', 'price', [['好，我这件穿。多少钱？', 'The verb comes before the object: 穿这件'], ['好，我穿这张。多少钱？', '衣服 takes 件'], ['好，我穿这件。多少钱吗？', 'Question-word questions don’t take 吗']]],
  ]],
  price: ['三百八十块。', 'Three hundred and eighty yuan.', [
    ['太贵了！便宜一点儿吧。', 'That’s too expensive! Can you do it cheaper?', 'deal', [['太便宜了！便宜一点儿吧。', '太便宜了 = too cheap!'], ['太贵了！一点儿便宜吧。', '一点儿 goes after the adjective: 便宜一点儿'], ['太贵了！贵一点儿吧。', '贵一点儿 = more expensive']]],
    ['好，我买了。', 'OK, I’ll take it.', 'else', [['好，我卖了。', '卖 mài = sell; buy is 买 mǎi'], ['好，我没买。', '没买 = didn’t buy'], ['好，我不买了。', '不买了 = not buying after all']]],
  ]],
  deal: ['好吧，三百块，怎么样？', 'All right, three hundred. How’s that?', [
    ['好，就三百吧！', 'OK, three hundred it is!', 'else', [['好，就三千吧！', '三千 = three thousand'], ['好，就三十吧！', '三十 = thirty: not what she offered'], ['好，三百就吧！', '就 goes before the number: 就三百吧']]],
    ['两百八，可以吗？', 'Two hundred and eighty, OK?', 'else', [['两千八，可以吗？', '两千八 = 2,800: more, not less'], ['两百八，可能吗？', '可能 = maybe; “is that OK?” is 可以吗'], ['两百八，可以呢？', 'A yes/no question takes 吗']]],
  ]],
  else: ['好的。还要别的吗？', 'Sure. Anything else?', [
    ['不要了，谢谢。', 'No, thanks.', 'wear', [['没要了，谢谢。', '“Not any more” is 不…了'], ['不要了，不客气。', '不客气 answers a thank-you'], ['要不了，谢谢。', '要不了 = can’t use that much']]],
    ['没有了，就这件。', 'That’s all, just this one.', 'wear', [['不有了，就这件。', '有 is negated with 没, never 不'], ['没有了，这件就。', '就 goes before: 就这件'], ['没有了，就这本。', '本 counts books']]],
  ]],
  wear: ['您要穿着走吗？', 'Would you like to wear it now?', [
    ['对，我穿着走。', 'Yes, I’ll wear it.', 'end', [['对，我穿走着。', '着 goes right after the verb: 穿着走'], ['对，我穿了走。', 'Wearing it as you leave is 穿着走'], ['对，我走着穿。', 'Reversed: put it on while walking']]],
    ['不，谢谢，我回家穿。', 'No thanks, I’ll wear it at home.', 'end', [['不，不客气，我回家穿。', '不客气 answers a thank-you'], ['不，谢谢，我回来穿。', '回来 = come back; going home is 回家'], ['不，谢谢，我家回穿。', '回家 = go home']]],
  ]],
  end: ['好的，欢迎再来！', 'Lovely. Come again!', 'end'],
}},

// ================= HSK 3 =================
{ id: 'doctor', l: 3, title: '看病', en: 'At the doctor’s', who: 'Doctor', intro: 'You have felt ill since yesterday and go to see a doctor.', start: 'hi', nodes: {
  hi: ['你好，哪儿不舒服？', 'Hello. What seems to be the problem?', [
    ['我头疼，还有点儿发烧。', 'I’ve got a headache and a bit of a fever.', 'since', [['我头疼，还一点儿发烧。', '“A bit” before a verb or adjective is 有点儿'], ['我疼头，还有点儿发烧。', 'The body part comes first: 头疼'], ['我头疼，还有点儿发现。', '发现 = discover; fever is 发烧']]],
    ['我好像感冒了，很不舒服。', 'I think I’ve caught a cold. I feel awful.', 'since', [['我好想感冒了，很不舒服。', '好想 hǎo xiǎng = really want to; “seem” is 好像 hǎoxiàng'], ['我好像感冒了，很舒服。', '很舒服 = very comfortable'], ['我好像感冒，很不舒服。', 'Having caught a cold needs 了: 感冒了']]],
  ]],
  since: ['从什么时候开始的？', 'Since when?', [
    ['从昨天晚上开始的。', 'Since last night.', 'check', [['从明天晚上开始的。', '明天 = tomorrow'], ['昨天晚上从开始的。', '从 comes first: 从昨天晚上'], ['从昨天晚上开会的。', '开会 = hold a meeting']]],
    ['两天了。', 'For two days now.', 'check', [['二天了。', 'Before 天, “two” is 两'], ['两个天了。', '天 takes no 个'], ['两天以后。', '以后 = after: “in two days”']], ['已经两天了。']],
  ]],
  check: ['我先给你检查一下。你吃药了吗？', 'Let me examine you first. Have you taken anything?', [
    ['还没吃。', 'Not yet.', 'exam', [['还不吃。', 'Something that hasn’t happened is negated with 没: 还没吃'], ['还没吃了。', '还没 doesn’t take 了'], ['没还吃。', '还 goes before 没: 还没']], ['还没有。', '没吃。']],
    ['吃了一次，可是没用。', 'I took something once, but it didn’t help.', 'exam', [['吃了一个次，可是没用。', '次 takes no 个'], ['一次吃了，可是没用。', 'The number of times goes after the verb: 吃了一次'], ['吃了一次，所以没用。', '所以 = so; here you mean 可是, but']]],
  ]],
  exam: ['没什么大问题，是感冒。', 'Nothing serious. It’s a cold.', [
    ['要吃药吗？', 'Do I need to take medicine?', 'meds', [['会吃药吗？', '会 = will / know how; “do I need to” is 要'], ['要吃糖吗？', '糖 = sweets'], ['要吃药什么？', '什么 = what; this is a yes/no question']]],
    ['太好了。我明天能上班吗？', 'What a relief. Can I go to work tomorrow?', 'work', [['太好了。我明天会上班吗？', '会 = will; asking if it is OK is 能'], ['太好了。我昨天能上班吗？', '昨天 = yesterday'], ['太好了。我明天能上网吗？', '上网 = go online']]],
  ]],
  work: ['最好在家休息一天。', 'Better to rest at home for a day.', [
    ['好，我跟经理说一下。', 'OK, I’ll let my manager know.', 'meds', [['好，我跟经理说一下吗。', '吗 turns it into a question'], ['好，我经理跟说一下。', '跟 + person comes before the verb: 跟经理说'], ['好，我跟经理说一次下。', '“Briefly” is 一下 right after the verb']]],
    ['好的。药怎么吃？', 'All right. How do I take the medicine?', 'meds', [['好的。药怎么样吃？', '怎么样 = how is it; “how do I…” is 怎么'], ['好的。药吃怎么？', '怎么 goes before the verb'], ['好的。要怎么吃？', '要 yào = want; medicine is 药 yào']]],
  ]],
  meds: ['这个药一天三次，饭后吃。', 'Take this three times a day, after meals.', [
    ['一天三次，饭后吃，对吗？', 'Three times a day, after meals, right?', 'rest', [['一天三次，饭前吃，对吗？', '饭前 = before meals'], ['三天一次，饭后吃，对吗？', '三天一次 = once every three days'], ['一天三个，饭后吃，对吗？', 'Times are counted with 次, not 个']]],
    ['一次吃几片？', 'How many tablets each time?', 'pills', [['一次吃几个片？', '片 is itself the measure word: 几片'], ['几次吃一片？', 'Reversed: “how many times per tablet?”'], ['一次吃多少片吗？', 'Question-word questions don’t take 吗']]],
  ]],
  rest: ['对。多喝水，多休息。', 'That’s right. Drink plenty of water and rest.', [
    ['好的，谢谢医生！', 'I will. Thank you, doctor!', 'end', [['好的，谢谢医院！', '医院 = hospital; the doctor is 医生'], ['好的，不客气医生！', '不客气 answers a thank-you'], ['好的，对不起医生！', '对不起 = sorry']]],
    ['我能洗澡吗？', 'Can I have a shower?', 'shower', [['我能洗手吗？', '洗手 = wash your hands'], ['我会洗澡吗？', '会 = know how; asking if it is OK is 能'], ['我能洗澡呢？', 'A yes/no question takes 吗']]],
  ]],
  shower: ['可以，但是别用冷水。', 'Yes, but not with cold water.', [
    ['好，我记住了。谢谢医生！', 'OK, I’ll remember. Thank you, doctor!', 'end', [['好，我记得了。谢谢医生！', '“Got it, I’ll remember” is 记住了'], ['好，我忘记了。谢谢医生！', '忘记 = forget'], ['好，我住记了。谢谢医生！', 'The word is 记住']]],
    ['知道了，谢谢！', 'Got it, thanks!', 'end', [['认识了，谢谢！', '认识 = get to know someone; “got it” is 知道了'], ['知道了，不客气！', '不客气 answers a thank-you'], ['不知道了，谢谢！', '不知道 = don’t know']]],
  ]],
  pills: ['一次两片。别忘了多喝水！', 'Two each time. And drink plenty of water!', [
    ['好，我记住了。谢谢医生！', 'OK, I’ll remember. Thank you, doctor!', 'end', [['好，我记得了。谢谢医生！', '“Got it, I’ll remember” is 记住了'], ['好，我忘记了。谢谢医生！', '忘记 = forget'], ['好，我住记了。谢谢医生！', 'The word is 记住']]],
    ['两片，好的。谢谢医生！', 'Two, OK. Thank you, doctor!', 'end', [['二片，好的。谢谢医生！', 'Before a measure word, “two” is 两'], ['两个片，好的。谢谢医生！', '片 is itself the measure word: 两片'], ['两片，好的。谢谢医院！', '医院 = hospital; the doctor is 医生']]],
  ]],
  end: ['不客气。好好休息！', 'You’re welcome. Get some good rest!', 'end'],
}},

{ id: 'hotel', l: 3, title: '住宾馆', en: 'Checking in at a hotel', who: 'Receptionist', intro: 'You arrive at a hotel late in the evening with a suitcase, without a booking.', start: 'hi', nodes: {
  hi: ['晚上好！有什么可以帮您的？', 'Good evening! How can I help?', [
    ['你好，还有房间吗？', 'Hi, do you have any rooms left?', 'rooms', [['你好，还是房间吗？', '“Any left?” is 还有'], ['你好，有还房间吗？', '还 goes before 有: 还有'], ['你好，还有房子吗？', '房子 = a house; a hotel room is 房间']]],
    ['你好，我想住两个晚上。', 'Hi, I’d like to stay two nights.', 'rooms', [['你好，我想住二个晚上。', 'Before a measure word, “two” is 两'], ['你好，我想两个晚上住。', 'How long goes after the verb: 住两个晚上'], ['你好，我想住两个晚饭。', '晚饭 = dinner']]],
  ]],
  rooms: ['有。您一个人住还是两个人住？', 'We do. Is it just you, or two people?', [
    ['一个人。', 'Just me.', 'price', [['一个人们。', '们 is never used with a number'], ['一口人。', '口 counts family members'], ['一位人。', '位 is a polite word for people and never goes with 人']], ['我一个人住。', '一个人住。', '一个。']],
    ['两个人，我和我妻子。', 'Two: me and my wife.', 'price', [['二个人，我和我妻子。', 'Before a measure word, “two” is 两'], ['两个人，我们和我妻子。', '我们 would make it three or more: 我和我妻子'], ['两个人，我在我妻子。', '和 = and; 在 = at']]],
  ]],
  price: ['一个晚上四百块，有早饭。', 'Four hundred a night, breakfast included.', [
    ['好，没问题。', 'Fine, no problem.', 'pass', [['好，没关系。', '没关系 answers an apology; “fine by me” is 没问题'], ['好，不问题。', '问题 is negated with 没: 没问题'], ['好，没问。', '问 = ask; “no problem” is 没问题']]],
    ['有点儿贵，有便宜一点儿的吗？', 'That’s a bit expensive. Is there anything cheaper?', 'cheap', [['一点儿贵，有便宜一点儿的吗？', '“A bit too” before an adjective is 有点儿'], ['有点儿贵，有一点儿便宜的吗？', '一点儿 goes after the adjective: 便宜一点儿'], ['有点儿便宜，有便宜一点儿的吗？', '有点儿便宜 = a bit cheap: then why ask for cheaper?']]],
  ]],
  cheap: ['有，三百块的，但是房间小一点儿。', 'There’s one for three hundred, but the room is a bit smaller.', [
    ['没关系，就要那个。', 'That’s fine, I’ll take it.', 'pass', [['不关系，就要那个。', 'The phrase is 没关系'], ['没关系，要就那个。', '就 goes before the verb: 就要'], ['没关系，就要哪个？', '哪个 nǎge = which one; “that one” is 那个 nàge']]],
    ['那还是四百的吧。', 'Then I’ll go with the four hundred one.', 'pass', [['那还有四百的吧。', '还有 = there is also; “I’d rather” is 还是'], ['那还是四十的吧。', '四十 = forty'], ['那是还四百的吧。', '还是 is one word here']]],
  ]],
  pass: ['好的。请给我看一下您的护照。', 'Very good. May I see your passport?', [
    ['好的，给您。', 'Sure, here you are.', 'floor', [['好的，送您。', '送 = give as a present'], ['好的，您给。', '给 comes before the person: 给您'], ['好的，给我。', '给我 = give it to me']]],
    ['护照在我的包里，我找一下。', 'It’s in my bag, just a moment.', 'floor', [['护照在我的包里，我找到一下。', '找到 = found; “have a look” is 找一下'], ['护照在我的包里，我一下找。', '一下 goes after the verb: 找一下'], ['护照在我的包里，我照一下。', '照 = take a photo; look for is 找']]],
  ]],
  floor: ['好了，谢谢。您的房间在八层，八零六。电梯在那边。', 'All done, thank you. You’re on the eighth floor, room 806. The lift is over there.', [
    ['八零六，好的。早饭几点开始？', '806, OK. What time does breakfast start?', 'bfast', [['六零八，好的。早饭几点开始？', 'Your room is 806, not 608'], ['八零六，好的。早饭几点开会？', '开会 = hold a meeting'], ['八零六，好的。早饭几点开始吗？', 'Question-word questions don’t take 吗']]],
    ['房间里能上网吗？', 'Is there internet in the room?', 'wifi', [['房间里会上网吗？', '会 = know how; “is it possible” is 能'], ['房间里能上楼吗？', '上楼 = go upstairs'], ['能上网房间里吗？', 'The place comes first: 房间里能上网吗']]],
  ]],
  bfast: ['早上七点到十点，在二层。', 'Seven to ten in the morning, on the second floor.', [
    ['好的，谢谢！', 'Great, thank you!', 'end', [['好的，不客气！', '不客气 answers a thank-you'], ['好的，对不起！', '对不起 = sorry'], ['好的，没关系！', '没关系 answers an apology']]],
    ['七点到十点，我记住了。', 'Seven to ten, I’ll remember that.', 'end', [['七点到十点，我忘记了。', '忘记 = forget'], ['七点到十点，我记得了。', '“Got it, I’ll remember” is 记住了'], ['十点到七点，我记住了。', 'Reversed: it starts at seven']]],
  ]],
  wifi: ['能，上网不要钱。', 'Yes, and it’s free.', [
    ['太好了，谢谢！', 'Great, thanks!', 'end', [['太好的，谢谢！', '“Great!” is 太好了'], ['太好了，不客气！', '不客气 answers a thank-you'], ['好太了，谢谢！', '太 goes before 好']]],
    ['不要钱？太好了！', 'Free? Great!', 'end', [['不要钱？太坏了！', '太坏了 = that’s terrible'], ['没要钱？太好了！', 'Here “it costs nothing” is 不要钱'], ['不要钱？太好！', '太…了 go together: 太好了']]],
  ]],
  end: ['不客气。有问题给我们打电话。晚安！', 'You’re welcome. Call us if you need anything. Good night!', 'end'],
}},

{ id: 'late', l: 3, title: '我要迟到了', en: 'Running late', who: 'Xiao Li, a colleague', intro: 'Your metro has stopped and the team meeting starts at nine. Your colleague Xiao Li calls.', start: 'hi', nodes: {
  hi: ['喂，你在哪儿呢？会议马上就要开始了！', 'Hello? Where are you? The meeting’s about to start!', [
    ['对不起，我还在地铁上。', 'Sorry, I’m still on the metro.', 'what', [['对不起，我又在地铁上。', '又 = again; “still” is 还'], ['对不起，我还在地图上。', '地图 = map'], ['没关系，我还在地铁上。', '没关系 answers an apology; you are the one apologising']]],
    ['我要迟到了，地铁坏了。', 'I’m going to be late, the metro’s broken down.', 'eta', [['我会迟到了，地铁坏了。', '“About to be late” is 要…了'], ['我要迟到了，地铁换了。', '换 = change; broken down is 坏了'], ['我迟到要了，地铁坏了。', '要 goes before the verb: 要迟到了']]],
  ]],
  what: ['还在地铁上？怎么了？', 'Still on the metro? What happened?', [
    ['地铁坏了，已经半个小时了。', 'It broke down. It’s been half an hour already.', 'eta', [['地铁好了，已经半个小时了。', '好了 = fixed: then why are you late?'], ['地铁坏了，已经半个小时以后。', '以后 = after; “it’s been…” is 已经…了'], ['坏了地铁，已经半个小时了。', 'Say what broke first: 地铁坏了']]],
    ['我也不知道，车不走了。', 'I don’t know. The train just isn’t moving.', 'eta', [['我也不认识，车不走了。', '认识 = know a person; “no idea” is 不知道'], ['我也知道，车不走了。', '我也知道 = I know too'], ['我也不知道，车没走了。', '“No longer moving” is 不…了']]],
  ]],
  eta: ['啊？那你什么时候能到？', 'What? So when can you get here?', [
    ['可能要晚半个小时。', 'Probably about half an hour late.', 'taxi', [['可能要早半个小时。', '早 = early'], ['可能要晚一半个小时。', '“Half an hour” is 半个小时'], ['可能要晚半个时间。', '“Half an hour” is 半个小时']]],
    ['九点半以前应该能到。', 'I should make it before half past nine.', 'taxi', [['半九点以前应该能到。', 'Half past nine is 九点半'], ['九点半以前应该能走。', '走 = leave; “get there” is 到'], ['九点半以前能应该到。', '应该 goes before 能: 应该能到']]],
  ]],
  taxi: ['你能不能下车，打个出租车？', 'Can you get off and grab a taxi?', [
    ['不行，车在两个站中间。', 'No, we’re stuck between two stations.', 'boss', [['可以，车在两个站中间。', '可以 = sure, which clashes with being stuck'], ['不行，车在二个站中间。', 'Before a measure word, “two” is 两'], ['不行，车在两个站间中。', 'The word is 中间']]],
    ['好主意，下一站我就下车。', 'Good idea. I’ll get off at the next stop.', 'boss', [['好主意，上一站我就下车。', '上一站 = the previous stop'], ['好主意，下一站我就上车。', '上车 = get on'], ['好主意，我就下车下一站。', 'The stop goes first: 下一站我就下车']]],
  ]],
  boss: ['好，我跟经理说一下。你别着急。', 'OK, I’ll tell the manager. Don’t panic.', [
    ['谢谢你！请你们先开始吧。', 'Thanks! Please start without me.', 'doc', [['谢谢你！请你们先结束吧。', '结束 = finish'], ['谢谢你！请你们开始先吧。', '先 goes before the verb: 先开始'], ['不客气！请你们先开始吧。', '不客气 answers a thank-you']]],
    ['好，帮我跟经理说对不起。', 'OK. Please tell the manager I’m sorry.', 'doc', [['好，帮我跟经理说没关系。', '没关系 = no problem; you mean sorry'], ['好，帮我经理跟说对不起。', '跟 + person comes before the verb'], ['好，让我跟经理说对不起。', '让我 = let me (do it myself)']]],
  ]],
  doc: ['对了，会议的东西你准备好了吗？', 'By the way, is your stuff for the meeting ready?', [
    ['准备好了，在我的电脑里。', 'It’s ready, it’s on my laptop.', 'arrive', [['准备了好，在我的电脑里。', '好 comes right after the verb: 准备好了'], ['准备好了，在我的电视里。', '电视 = TV'], ['准备好了，放我的电脑里。', 'Saying where it is takes 在']]],
    ['差不多了，我在地铁上再看看。', 'Almost. I’ll go over it again on the metro.', 'arrive', [['差多不了，我在地铁上再看看。', 'The phrase is 差不多'], ['差不多了，我在地铁上再看见。', '看见 = to spot; “go over” is 看看'], ['差不多了，我在地图上再看看。', '地图 = map']]],
  ]],
  arrive: ['好。你到了以后直接来会议室，我们在三层。', 'OK. When you get here, come straight to the meeting room. We’re on the third floor.', [
    ['好，三层会议室，我知道了。', 'OK, third-floor meeting room, got it.', 'end', [['好，三层会议室，我认识了。', '认识 = get to know someone; “got it” is 我知道了'], ['好，四层会议室，我知道了。', '四层 = fourth floor; she said 三层'], ['好，三层会议室，我不知道了。', '不知道 = don’t know']]],
    ['好的，一会儿见！', 'OK, see you in a bit!', 'end', [['好的，一点儿见！', '一点儿 = a little; “in a bit” is 一会儿'], ['好的，一会儿看见！', '看见 = to spot; “see you” is just 见'], ['好的，一下见！', '一下 = once, briefly; “see you in a bit” is 一会儿见']]],
  ]],
  end: ['一会儿见！路上小心。', 'See you soon! Take care on the way.', 'end'],
}},

{ id: 'phone', l: 3, title: '手机找不到了', en: 'The lost phone', who: 'Xiaoxue, a friend', intro: 'You have just got out of a taxi with your friend Xiaoxue, and your phone is gone.', start: 'hi', nodes: {
  hi: ['你怎么了？在找什么？', 'What’s up? What are you looking for?', [
    ['我的手机找不到了！', 'I can’t find my phone!', 'calm', [['我的手机找到了！', '找到了 = found it'], ['我的手机找得到！', '找得到 = can find it'], ['我的手表找不到了！', '手表 = watch']]],
    ['我的手机呢？刚才还在这儿！', 'Where’s my phone? It was right here!', 'calm', [['我的手机吗？刚才还在这儿！', '“Where is…?” is 呢; 吗 asks yes or no'], ['我的手机呢？刚才又在这儿！', '又 = again; “was just here” is 还在'], ['我的手机呢？刚才还是这儿！', '还是 = or, still be; “was here” is 还在']]],
  ]],
  calm: ['别着急。你看看包里有没有？', 'Don’t panic. Have you checked your bag?', [
    ['看了，包里没有。', 'I did. It’s not in there.', 'when', [['看见了，包里没有。', '看见了 = spotted it: then it would be there'], ['看了，包里不有。', '有 is negated with 没'], ['看了，里包没有。', 'Inside the bag is 包里']]],
    ['我再看看……也没有。', 'Let me look again… no, not there.', 'when', [['我又看看……也没有。', 'Doing something again from now on is 再'], ['我再看看……也有。', '也有 = it’s there too'], ['我再看见……也没有。', '看见 = to spot; “have a look” is 看看']]],
  ]],
  when: ['你最后一次用手机是什么时候？', 'When did you last use it?', [
    ['在出租车上，我给妈妈打了个电话。', 'In the taxi. I called my mum.', 'taxi', [['在出租车上，我给妈妈打了个电视。', '电视 = TV'], ['在出租车上，我妈妈给打了个电话。', '给 + person comes before the verb: 给妈妈打'], ['在出租车下，我给妈妈打了个电话。', '车下 = under the car; in the taxi is 车上']]],
    ['我记得在饭馆还用了。', 'I remember using it at the restaurant.', 'rest', [['我记住在饭馆还用了。', '记住 = memorise; “I remember (that)” is 记得'], ['我记得在宾馆还用了。', '宾馆 = hotel'], ['我记得饭馆在还用了。', '在 goes before the place: 在饭馆']]],
  ]],
  rest: ['饭馆以后我们坐了出租车，你在车上用了吗？', 'After the restaurant we took a taxi. Did you use it in the taxi?', [
    ['对！我在车上给妈妈打了电话。', 'Yes! I called my mum in the taxi.', 'taxi', [['对！我在车上给妈妈打了电脑。', '电脑 = computer'], ['对！我在车上妈妈给打了电话。', '给 + person comes before the verb: 给妈妈打'], ['不对！我在车上给妈妈打了电话。', '不对 = no, which clashes with using it']]],
    ['我不记得了。', 'I don’t remember.', 'taxi', [['我没记得了。', '记得 is negated with 不'], ['我不记住了。', '“Can’t remember” is 不记得了'], ['我不认识了。', '认识 = know a person']]],
  ]],
  taxi: ['那可能忘在出租车上了。', 'Then you probably left it in the taxi.', [
    ['那怎么办？', 'So what do I do?', 'plan', [['那怎么样？', '怎么样 = how is it; “what do I do?” is 怎么办'], ['那什么办？', '“What do I do?” is 怎么办'], ['那办怎么？', '怎么 goes before the verb: 怎么办']]],
    ['你能给我的手机打个电话吗？', 'Can you call my phone?', 'call', [['你会给我的手机打个电话吗？', '会 = know how; asking a favour is 能'], ['你能我的手机给打个电话吗？', '给 + phone goes before the verb'], ['你能给我的手表打个电话吗？', '手表 = watch']]],
  ]],
  call: ['我打了，没有人接。', 'I tried. Nobody’s answering.', [
    ['司机可能没听见。', 'The driver probably didn’t hear it.', 'plan', [['司机可能没看见。', '看见 = see; a ringing phone is 听见'], ['司机可能不听见。', 'Something that didn’t happen is negated with 没'], ['司机可以没听见。', '可以 = may (allowed); “probably” is 可能']]],
    ['那怎么办？', 'So what do I do?', 'plan', [['那怎么样？', '怎么样 = how is it; “what do I do?” is 怎么办'], ['那什么办？', '“What do I do?” is 怎么办'], ['那办怎么？', '怎么 goes before the verb: 怎么办']]],
  ]],
  plan: ['你有发票吗？上面有电话。', 'Did you get a receipt? It has a phone number on it.', [
    ['有，在这儿！', 'Yes, here it is!', 'company', [['是，在这儿！', '“Did you get…?” is answered with 有'], ['没有，在这儿！', '没有 = no: then what is here?'], ['有，这儿在！', '在 comes before the place: 在这儿']]],
    ['没有，我没拿发票。', 'No, I didn’t take one.', 'number', [['没有，我不拿发票。', 'Something that didn’t happen is negated with 没'], ['没有，我没拿发烧。', '发烧 = fever'], ['没有，我拿没发票。', '没 goes before the verb']]],
  ]],
  company: ['太好了！我来打这个电话，你别着急。', 'Great! I’ll call that number. Don’t worry.', [
    ['太谢谢你了！', 'Thank you so much!', 'end', [['太谢谢你！', '太…了 go together: 太谢谢你了'], ['谢谢你太了！', '太 goes before the verb'], ['太对不起你了！', '对不起 = sorry']]],
    ['你真是我的好朋友！', 'You’re a real friend!', 'end', [['你真是我的朋友好！', '好 goes before the noun: 好朋友'], ['你真是我的好朋友吗！', '吗 turns it into a question'], ['你正是我的好朋友！', '正是 = exactly; “really are” is 真是']]],
  ]],
  number: ['没关系，我记得那辆车的号。我给出租车公司打电话。', 'Never mind, I remember the car’s number. I’ll call the taxi company.', [
    ['你记得车的号？太好了！', 'You remember the number? Brilliant!', 'end', [['你忘记车的号？太好了！', '忘记 = forget'], ['你记得车的号？太坏了！', '太坏了 = that’s terrible'], ['你记得车号的？太好了！', '的 goes before 号: 车的号']]],
    ['太谢谢你了！', 'Thank you so much!', 'end', [['太谢谢你！', '太…了 go together: 太谢谢你了'], ['谢谢你太了！', '太 goes before the verb'], ['太对不起你了！', '对不起 = sorry']]],
  ]],
  end: ['……找到了！司机说他马上送回来。', '…Found it! The driver says he’ll bring it straight back.', 'end'],
}},
];
