function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function matchesQuery(listing, query) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const name = [listing.title, listing.terms, listing.variant, listing.set_name, listing.card_number, listing.language]
    .join(' ').toLowerCase();
  return terms.every(term => name.includes(term));
}

function sameProduct(left, right) {
  if (left.sample !== right.sample || left.currency !== right.currency || left.model_year !== right.model_year) return false;
  if (left.comparison_group || right.comparison_group) {
    return left.comparison_group === right.comparison_group && left.variant === right.variant;
  }
  const fields = ['card_number', 'set_name', 'finish', 'language', 'grader', 'grade', 'buying_option'];
  return fields.every(field => left[field] === right[field]);
}

export function searchListings(listings, { query, grade, budget, year }) {
  const limit = budget === '' ? Infinity : Math.round(Number(budget) * 100);

  return listings.filter(listing => {
    return matchesQuery(listing, query)
      && (!year || listing.model_year === Number(year))
      && (!grade || grade === `${listing.grader} ${listing.grade}`)
      && listing.price_cents <= limit;
  }).sort((a, b) => a.price_cents - b.price_cents).map(listing => {
    const peers = listings.filter(other => other.item_id !== listing.item_id
      && sameProduct(listing, other))
      .sort((a, b) => a.price_cents - b.price_cents);
    const benchmark = peers.length >= 3 ? median(peers.map(peer => peer.price_cents)) : null;
    const delta = benchmark === null ? null : benchmark - listing.price_cents;
    const percent = benchmark ? delta / benchmark * 100 : null;
    return { listing, peers, benchmark, delta, percent };
  });
}
