const DEFAULT_SORT_OPTIONS = [
    'price-asc-rank',
    'price-desc-rank',
    'date-desc-rank',
    'review-rank',
    'relevance-rank'
  ];
  
  const DEFAULT_SEARCH_TERMS = [
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
    'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
  ];
  const DEFAULT_PRICE_SEGMENTS = [
    { min: 0, max: 25 },
    { min: 25, max: 50 },
    { min: 50, max: 100 },
    { min: 100, max: 200 },
    { min: 200, max: null } // null = üst sınır yok
  ];
  module.exports = {
    DEFAULT_SORT_OPTIONS,
    DEFAULT_SEARCH_TERMS,
    DEFAULT_PRICE_SEGMENTS
  };