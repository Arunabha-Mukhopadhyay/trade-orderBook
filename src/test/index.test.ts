import request from 'supertest';
import { app, TICKER } from '../index.js';

/**
 * Comprehensive test suite for the Stock Trade System API
 *
 * IMPORTANT: Module-level state (users, bids, asks) persists across all tests
 * within this file. Tests are intentionally ordered to build on previous state.
 *
 * Initial state:
 *   User 1: { GOOGLE: 10, USD: 50000 }
 *   User 2: { GOOGLE: 10, USD: 50000 }
 *   Order book: bids = [], asks = []
 */

describe('GET /', () => {
  it('should return 200 with the welcome message', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Welcome to the Stock Trade System!');
  });
});


describe('GET /balance/:userId — initial balances', () => {
  it('should return correct initial balances for user 1', async () => {
    const res = await request(app).get('/balance/1');
    expect(res.status).toBe(200);
    expect(res.body.balances).toBeDefined();
    expect(res.body.balances[TICKER]).toBe(10);
    expect(res.body.balances['USD']).toBe(50000);
  });

  it('should return correct initial balances for user 2', async () => {
    const res = await request(app).get('/balance/2');
    expect(res.status).toBe(200);
    expect(res.body.balances).toBeDefined();
    expect(res.body.balances[TICKER]).toBe(10);
    expect(res.body.balances['USD']).toBe(50000);
  });

  it('should return zero balances for a non-existent user', async () => {
    const res = await request(app).get('/balance/999');
    expect(res.status).toBe(200);
    expect(res.body.USD).toBe(0);
    expect(res.body[TICKER]).toBe(0);
  });
});


describe('GET /depth — empty order book', () => {
  it('should return empty depth when no orders have been placed', async () => {
    const res = await request(app).get('/depth');
    expect(res.status).toBe(200);
    expect(res.body.depth).toEqual({});
  });
});


//
//  After this block:
//    bids: [{ userId: '1', price: 1000, qty: 3 }]
//    asks: [{ userId: '2', price: 1500, qty: 2 }]
//    Balances unchanged.
describe('POST /order — unmatched orders', () => {
  it('should place a bid with no matching asks and return filledQuantity 0', async () => {
    const res = await request(app)
      .post('/order')
      .send({ side: 'bid', price: 1000, quantity: 3, userId: '1' });
    expect(res.status).toBe(200);
    expect(res.body.filledQuantity).toBe(0);
  });

  it('should place an ask above the highest bid — no match', async () => {
    const res = await request(app)
      .post('/order')
      .send({ side: 'ask', price: 1500, quantity: 2, userId: '2' });
    expect(res.status).toBe(200);
    expect(res.body.filledQuantity).toBe(0);
  });

  it('should not change any user balances after unmatched orders', async () => {
    const res1 = await request(app).get('/balance/1');
    expect(res1.body.balances[TICKER]).toBe(10);
    expect(res1.body.balances['USD']).toBe(50000);

    const res2 = await request(app).get('/balance/2');
    expect(res2.body.balances[TICKER]).toBe(10);
    expect(res2.body.balances['USD']).toBe(50000);
  });
});


describe('GET /depth — after unmatched orders', () => {
  it('should show the bid at 1000 and ask at 1500 in depth', async () => {
    const res = await request(app).get('/depth');
    expect(res.status).toBe(200);
    expect(res.body.depth['1000']).toEqual({ quantity: 3, type: 'bid' });
    expect(res.body.depth['1500']).toEqual({ quantity: 2, type: 'ask' });
  });
});

//  POST /order — Partial Match: Ask fills against existing Bid
//
//  User 2 places ask at 900, qty 5.
//  Matches bid@1000 (qty 3) → 3 shares filled at price 900.
//  Remaining 2 shares added to asks.
//
//  After this block:
//    bids: []
//    asks: [{ price:1500, qty:2 }, { price:900, qty:2 }]
//    User 1: GOOGLE=13, USD=47300
//    User 2: GOOGLE=7,  USD=52700

describe('POST /order — ask partially fills against bid', () => {
  it('should fill 3 of 5 shares and return filledQuantity 3', async () => {
    const res = await request(app)
      .post('/order')
      .send({ side: 'ask', price: 900, quantity: 5, userId: '2' });
    expect(res.status).toBe(200);
    expect(res.body.filledQuantity).toBe(3);
  });

  it('should credit buyer (user 1) with +3 GOOGLE and debit 2700 USD', async () => {
    const res = await request(app).get('/balance/1');
    expect(res.body.balances[TICKER]).toBe(13);   // 10 + 3
    expect(res.body.balances['USD']).toBe(47300);  // 50000 - (3 × 900)
  });

  it('should debit seller (user 2) with -3 GOOGLE and credit 2700 USD', async () => {
    const res = await request(app).get('/balance/2');
    expect(res.body.balances[TICKER]).toBe(7);     // 10 - 3
    expect(res.body.balances['USD']).toBe(52700);  // 50000 + (3 × 900)
  });

  it('should remove consumed bid and add remaining ask to depth', async () => {
    const res = await request(app).get('/depth');
    // bid@1000 fully consumed
    expect(res.body.depth['1000']).toBeUndefined();
    // ask@1500 unchanged
    expect(res.body.depth['1500']).toEqual({ quantity: 2, type: 'ask' });
    // remaining 2 shares of the new ask at 900
    expect(res.body.depth['900']).toEqual({ quantity: 2, type: 'ask' });
  });
});

//  POST /order — Partial Match: Bid fills against existing Ask
//
//  User 1 places bid at 1000, qty 3.
//  Matches ask@900 (qty 2) — cheaper ask matched first.
//  ask@1500 is too expensive (1500 > 1000), skipped.
//  2 shares filled at price 900, remaining 1 added to bids.
//
//  After this block:
//    bids: [{ price:1000, qty:1 }]
//    asks: [{ price:1500, qty:2 }]
//    User 1: GOOGLE=15, USD=45500
//    User 2: GOOGLE=5,  USD=54500
describe('POST /order — bid partially fills against ask', () => {
  it('should fill 2 of 3 shares against the cheaper ask', async () => {
    const res = await request(app)
      .post('/order')
      .send({ side: 'bid', price: 1000, quantity: 3, userId: '1' });
    expect(res.status).toBe(200);
    expect(res.body.filledQuantity).toBe(2);
  });

  it('should update buyer (user 1) balances after bid match', async () => {
    const res = await request(app).get('/balance/1');
    expect(res.body.balances[TICKER]).toBe(15);    // 13 + 2
    expect(res.body.balances['USD']).toBe(45500);   // 47300 - (2 × 900)
  });

  it('should update seller (user 2) balances after bid match', async () => {
    const res = await request(app).get('/balance/2');
    expect(res.body.balances[TICKER]).toBe(5);      // 7 - 2
    expect(res.body.balances['USD']).toBe(54500);    // 52700 + (2 × 900)
  });

  it('should show remaining bid and untouched ask in depth', async () => {
    const res = await request(app).get('/depth');
    // ask@900 fully consumed
    expect(res.body.depth['900']).toBeUndefined();
    // remaining 1 share of the new bid at 1000
    expect(res.body.depth['1000']).toEqual({ quantity: 1, type: 'bid' });
    // ask@1500 untouched (price too high for the bid)
    expect(res.body.depth['1500']).toEqual({ quantity: 2, type: 'ask' });
  });
});

//  GET /depth — Price-Level Aggregation
//
//  Verifies that multiple orders at the same price are
//  aggregated correctly in the depth response.
describe('GET /depth — price level aggregation', () => {
  it('should aggregate multiple orders at the same price level', async () => {
    // Place another bid at 1000 from user 2 (adds to existing bid@1000 qty 1)
    const orderRes = await request(app)
      .post('/order')
      .send({ side: 'bid', price: 1000, quantity: 4, userId: '2' });
    expect(orderRes.body.filledQuantity).toBe(0);

    const res = await request(app).get('/depth');
    // existing bid@1000 (qty 1) + new bid@1000 (qty 4) = 5
    expect(res.body.depth['1000']).toEqual({ quantity: 5, type: 'bid' });
    expect(res.body.depth['1500']).toEqual({ quantity: 2, type: 'ask' });
  });
});

// ═══════════════════════════════════════════════════════════
//  Edge Cases & Error Handling
// ═══════════════════════════════════════════════════════════
describe('Edge cases', () => {
  it('should return 404 for undefined routes', async () => {
    const res = await request(app).get('/nonexistent');
    expect(res.status).toBe(404);
  });

  it('should accept a bid that does not cross any ask', async () => {
    // Bid at 500 won't match ask at 1500
    const res = await request(app)
      .post('/order')
      .send({ side: 'bid', price: 500, quantity: 1, userId: '1' });
    expect(res.status).toBe(200);
    expect(res.body.filledQuantity).toBe(0);
  });

  it('should accept an ask that does not cross any bid', async () => {
    // Ask at 2000 won't match any bids at 1000 or 500
    const res = await request(app)
      .post('/order')
      .send({ side: 'ask', price: 2000, quantity: 1, userId: '2' });
    expect(res.status).toBe(200);
    expect(res.body.filledQuantity).toBe(0);
  });

  it('should show all price levels in depth after edge-case orders', async () => {
    const res = await request(app).get('/depth');
    expect(res.body.depth['500']).toEqual({ quantity: 1, type: 'bid' });
    expect(res.body.depth['1000']).toEqual({ quantity: 5, type: 'bid' });
    expect(res.body.depth['1500']).toEqual({ quantity: 2, type: 'ask' });
    expect(res.body.depth['2000']).toEqual({ quantity: 1, type: 'ask' });
  });
});