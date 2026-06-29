import express from 'express';
import bodyParser from 'body-parser';

export const app = express();

app.use(bodyParser.json());

app.use(express.static('public'));

interface Balance {
  [key: string]: number;
}

interface users {
  id: string;
  balances: Balance;
}

interface Orders {
  userId: string;
  price: number;
  quantity: number;
}

export const TICKER = "GOOGLE";

const users: users[] = [{
  id: "1",
  balances: {
    "GOOGLE": 10,
    "USD": 50000
  }
}, {
    id: "2",
    balances: {
      "GOOGLE": 10,
      "USD": 50000
    }
  }];


const bids:Orders[] = [];
const asks:Orders[] = [];

app.get('/', (req: any, res: any) => {
  res.status(200).send('Welcome to the Stock Trade System!');
});

// adding the limit order logic for both buy and sell orders
app.post('/order',(req: any, res: any) => {
  const side: string = req.body.side;
  const price: number = req.body.price;
  const quantity: number = req.body.quantity;
  const userId: string = req.body.userId;


  const remainingQty = fillOrders(side, price, quantity, userId);

  if(remainingQty === 0) {
    res.status(200).send('Order filled');
  }

  if(side == 'bid'){
    bids.push({userId, price, quantity: remainingQty});
    bids.sort((a, b) => a.price < b.price ? -1 : 1);
  } else{
    asks.push({userId, price, quantity: remainingQty});
    asks.sort((a, b) => a.price > b.price ? -1 : 1);
  }

  res.json({
    filledQuantity: quantity - remainingQty,
  });
});


// adding the depth order logic
app.get('/depth', (req: any, res: any) => {
  const depth: {
    [price: string]: {
      type: "bid" | "ask",
      quantity: number,
    }
  } = {};

  for(const bid of bids) {
  if (!depth[bid.price]) {
    depth[bid.price] = { quantity: bid.quantity, type: 'bid' };
  } else {
    depth[bid.price]!.quantity += bid.quantity;
  }
}

for (const ask of asks) {
  if (!depth[ask.price]) {
    depth[ask.price] = { quantity: ask.quantity, type: 'ask' };
  } else {
    depth[ask.price]!.quantity += ask.quantity;
  }
}

  res.json({ depth });
})


app.get('/quote',(req:any,res:any)=>{
  
})


app.get("/balance/:userId", (req, res) => {
  const userId = req.params.userId;
  const user = users.find(x => x.id === userId);
  if (!user) {
    return res.json({
      USD: 0,
      [TICKER]: 0
    })
  }
  res.json({ balances: user.balances });
})

function flipBalance(userId1: string, userId2: string, quantity: number, price: number): void {
  let user1 = users.find(x => x.id === userId1);
  let user2 = users.find(x => x.id === userId2);
  if (!user1 || !user2) {
    return;
  }

  user1.balances[TICKER] = (user1.balances[TICKER] ?? 0) - quantity;
  user2.balances[TICKER] = (user2.balances[TICKER] ?? 0) + quantity;
  user1.balances['USD'] = (user1.balances['USD'] ?? 0) + quantity * price;
  user2.balances['USD'] = (user2.balances['USD'] ?? 0) - quantity * price;
}

function fillOrders(side: string, price: number, quantity: number, userId: string): number {
  let remainingQuantity = quantity;
  if (side === "bid") {
    for (let i = asks.length - 1; i >= 0; i--) {
      const ask = asks[i];
      if (!ask) {
        continue;
      }
      if (ask.price > price) {
        continue;
      }
      if (ask.quantity > remainingQuantity) {
        ask.quantity -= remainingQuantity;
        flipBalance(ask.userId, userId, remainingQuantity, ask.price);
        return 0;
      } else {
        remainingQuantity -= ask.quantity;
        flipBalance(ask.userId, userId, ask.quantity, ask.price);
        asks.pop();
      }
    }
  } else {
    for (let i = bids.length - 1; i >= 0; i--) {
      const bid = bids[i];
      if (!bid) {
        continue;
      }
      if (bid.price < price) {
        continue;
      }
      if (bid.quantity > remainingQuantity) {
        bid.quantity -= remainingQuantity;
        flipBalance(userId, bid.userId, remainingQuantity, price);
        return 0;
      } else {
        remainingQuantity -= bid.quantity;
        flipBalance(userId, bid.userId, bid.quantity, price);
        bids.pop();
      }
    }
  }
  return remainingQuantity;
}