const examples = [
  {
    model: 'Sony WH-1000XM5',
    terms: 'wireless noise canceling headphones',
    variant: 'Black, new',
    modelYear: 2022,
    prices: [249, 269, 299, 329]
  },
  {
    model: 'Canon EOS R50',
    terms: 'mirrorless digital camera',
    variant: 'Body only, new',
    modelYear: 2023,
    prices: [549, 579, 599, 629]
  }
];

export const sampleProducts = examples.flatMap(({ model, terms, variant, modelYear, prices }) =>
  prices.map((price, index) => ({
    item_id: `sample-${model}-${index}`,
    title: model,
    terms,
    variant,
    model_year: modelYear,
    comparison_group: model,
    price_cents: price * 100,
    currency: 'USD',
    sample: true
  }))
);
