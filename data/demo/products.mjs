const examples = [
  {
    model: 'Sony WH-1000XM5',
    terms: 'наушники беспроводные headphones sony',
    variant: 'Чёрные · новые',
    prices: [249, 269, 299, 329]
  },
  {
    model: 'Canon EOS R50',
    terms: 'камера фотоаппарат canon camera',
    variant: 'Корпус без объектива · новый',
    prices: [549, 579, 599, 629]
  }
];

export const sampleProducts = examples.flatMap(({ model, terms, variant, prices }) =>
  prices.map((price, index) => ({
    item_id: `sample-${model}-${index}`,
    title: model,
    terms,
    variant,
    comparison_group: model,
    price_cents: price * 100,
    currency: 'USD',
    sample: true
  }))
);
