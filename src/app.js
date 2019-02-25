import { fromXML } from 'from-xml'
import fetch from 'node-fetch'
import loadDB from './database'
import tm from './telegram'


const CHAT_IDS = [...new Set(JSON.parse(process.env.TELEGRAM_SINKS))]
const ERRORS_LOG_CHAT = process.env.ERRORS_LOG_CHAT

const FEED_URLS = [...new Set(JSON.parse(process.env.RSS_FEED_URLS))]
const INSTANT_VIEW_HASH = process.env.INSTANT_VIEW_HASH  // concrete rules are in xpath.txt


let grabRSS = url =>
  fetch(url).then(res => res.text()).then(body => fromXML(body))


// check the `rss-example.json` file for the concrete structure
let extractPosts = xml =>
  xml.rss.channel.item.reverse()
    .map(p => {
      // remove ?utm_source and other parameters
      p.link = p.link.replace(/^(.*?)(\?.*)?$/, '$1')
      return p
    })


let skipExisting = db => posts =>
  posts.filter(p =>
    0 === db.get('posts').find({ id: `${p.link}` }).size().value())


let savePosts = db => posts => {
  let storage = db.get('posts')
  for (let p of posts) storage = storage.push({ id: `${p.link}` })
  storage.write()
}


let sleep = ms => new Promise(resolve => setTimeout(resolve, ms))


let sendToChat = async posts => {
  for (let p of posts) {
    let link = encodeURIComponent(p.link)
    let embed_link = p.link + '?utm_source=channel&utm_medium=telegram'

    let msg = `[\u200a](https://t.me/iv?url=${link}&rhash=${INSTANT_VIEW_HASH})\u200a[${p.title}](${embed_link})`
    await sleep((1 + Math.random()) * 2000)

    try {
      for (let chat of CHAT_IDS)
        await tm.sendMessage(chat, msg, { parse_mode: 'Markdown' })
    } catch (e) {
      tm.sendMessage(ERRORS_LOG_CHAT, e.toString())
      throw e
    }
  }

  return posts
}


loadDB.then(db =>
  Promise.all(FEED_URLS.map(url => grabRSS(url).then(extractPosts)))
    .then(lists => lists.flat())
    .then(skipExisting(db))
    .then(ps => console.log(`New posts: ${ps.length}`) || ps)
    .then(sendToChat)
    .then(savePosts(db)))
