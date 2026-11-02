import React from 'react';import {createRoot} from 'react-dom/client';import Scratch from '../src/Scratch';import '../src/style.css';
createRoot(document.getElementById('root')).render(<Scratch result={{amount:300,coupon:'TEST-ONLY-NOT-A-VALID-COUPON',drawn_at:new Date().toISOString(),redeemed:false}}/>);
