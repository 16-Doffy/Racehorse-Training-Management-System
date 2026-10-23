/**
 * What a feed is, for how long a horse waits between eating it and harder work: forage (hay, straw)
 * sits lighter than concentrates (grain, pellets), and supplements (oil, minerals, vitamins,
 * electrolytes) are not a meal at all. The Manager sets it on the stock item; an item without one
 * (stocked before the field existed) is guessed from its name.
 */
const FEED_TYPES = ['forage', 'concentrate', 'supplement'];

const FORAGE = /(cỏ|hay|rơm|alfalfa|timothy|chaff|straw)/i;
const SUPPLEMENT = /(vitamin|khoáng|mineral|muối|\bsalt\b|điện giải|electrolyte|dầu|\boil\b)/i;

function guessFeedType(name = '') {
  if (SUPPLEMENT.test(name)) return 'supplement';
  return FORAGE.test(name) ? 'forage' : 'concentrate';
}

const feedTypeOf = (item) => (FEED_TYPES.includes(item?.feedType) ? item.feedType : guessFeedType(item?.name));

module.exports = { FEED_TYPES, guessFeedType, feedTypeOf };
