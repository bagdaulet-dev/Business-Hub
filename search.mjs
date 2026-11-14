function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function searchListings(listings, { query, grade, budget }) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const limit = budget === '' ? Infinity : Math.round(Number(budget) * 100);

  return listings.filter(listing => {
    const name = [listing.title, listing.set_name, listing.card_number, listing.language].join(' ').toLowerCase();
    return terms.every(term => name.includes(term))
      && (!grade || grade === `${listing.grader} ${listing.grade}`)
      && listing.price_cents <= limit;
  }).sort((a, b) => a.price_cents - b.price_cents).map(listing => {
    const comparableFields = ['card_number', 'set_name', 'finish', 'language', 'grader', 'grade', 'currency', 'buying_option'];
    const peers = listings.filter(other => other.item_id !== listing.item_id
      && comparableFields.every(field => other[field] === listing[field]))
      .sort((a, b) => a.price_cents - b.price_cents);
    const benchmark = peers.length >= 3 ? median(peers.map(peer => peer.price_cents)) : null;
    const delta = benchmark === null ? null : benchmark - listing.price_cents;
    const percent = benchmark ? delta / benchmark * 100 : null;
    return { listing, peers, benchmark, delta, percent };
  });
}
