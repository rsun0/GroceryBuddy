import React from 'react';

import {
  ScrollView, View, StyleSheet, Alert, TouchableNativeFeedback, TouchableHighlight, Platform,
  ActivityIndicator,
} from 'react-native';
import {
  Text, ListItem, Button, Avatar, Icon, Badge,
} from 'react-native-elements';
import Collapsible from 'react-native-collapsible';
import { Ionicons } from '@expo/vector-icons';
import { searchByUPC } from '../utils/api';
import ItemSearchBar from '../components/ItemSearchBar';

const storeLogos = {
  Schnucks: 'https://d2d8wwwkmhfcva.cloudfront.net/195x/d2lnr5mha7bycj.cloudfront.net/warehouse/logo/216/9154d284-86de-4383-a73b-5779ace514f0.png',
  Aldi: 'https://corporate.aldi.us/fileadmin/_processed_/7/6/csm_aldi_logo_2017_bd4f8371bc.jpg',
  'Harvest Market': 'https://scontent-ort2-2.xx.fbcdn.net/v/t31.0-8/13613392_151339761940766_246331264216770468_o.jpg?_nc_cat=103&_nc_ht=scontent-ort2-2.xx&oh=2d7694bfebaa768125b7be75ea4424b7&oe=5D412F44',
  'County Market': 'https://scontent-ort2-2.xx.fbcdn.net/v/t1.0-9/15803_580000272016261_661242806_n.jpg?_nc_cat=104&_nc_ht=scontent-ort2-2.xx&oh=6e3a82481fb7828bbee37ae90904dc65&oe=5D2B2E5F',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 10,
  },
  footer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  horizontalRow: {
    padding: 15,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
  },
  subtitle: {
    textAlign: 'center',
    paddingTop: 10,
  },
  loading: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/**
 * Class representing the search or list page
 * @extends React.Component
 */
export default class SearchPage extends React.Component {
  static navigationOptions = ({ navigation }) => ({
    title: navigation.getParam('name', 'Create Shopping List'),
    headerRight: (
      <Ionicons
        name="md-refresh"
        size={24}
        style={{ marginRight: 15 }}
        onPress={navigation.getParam('refresh')}
      />
    ),
  })

  /**
   * The constructor for creating a search page
   * @param {object} props
   */
  constructor(props) {
    super(props);
    this.state = {
      stores: {},
      selectedStore: '',
      isCollapsed: true,
    };
  }

  /**
   * Register the refresh function on the header
   */
  componentDidMount() {
    try {
      this.props.navigation.setParams({ refresh: this.refresh });
    } catch (err) {
      // navigation is undefined during testing, this is as expected
    }
  }

  /**
   * Refetches all the data by grabbing upc codes and executing
   * a upc query on the API. Each item's new data replaces
   * the old data
   */
  refresh = async () => {
    this.setState({ refreshing: true });
    const upcCodes = [];
    if (Object.keys(this.state.stores).length > 0) {
      const firstStoreKey = Object.keys(this.state.stores)[0];
      const { items } = this.state.stores[firstStoreKey];
      const newItems = [];
      for (let i = 0; i < items.length; i += 1) {
        const { upc } = items[i];
        upcCodes.push(upc);
        const newItem = (await searchByUPC(upc))[0] //eslint-disable-line
        newItems.push(newItem);
      }
      for (let i = 0; i < upcCodes.length; i += 1) {
        await this.deleteItem(0);//eslint-disable-line
      }
      for (let i = 0; i < upcCodes.length; i += 1) {
        this.addItem(newItems[i]);
      }
    }
    this.setState({ refreshing: false });
  }

  /**
   * Adds an item to the list and each shopping page
   * @param  {object} item - the item to be added
   */
  addItem = (item) => {
    const newStores = Object.assign({}, this.state.stores) //eslint-disable-line

    let cheapestPrice = Number.MAX_VALUE;
    let cheapestItem = null;
    const allStoreNames = [];

    for (let i = 0; i < item.stores.length; i += 1) {
      const storeName = item.stores[i].name;
      allStoreNames.push(storeName);
      if (!(storeName in newStores)) {
        // create new store, save lat and long
        newStores[storeName] = {};
        newStores[storeName].items = [];
        newStores[storeName].lat = item.stores[i].location.lat;
        newStores[storeName].long = item.stores[i].location.long;
      }

      // set universal parameters for item
      const strippedItem = {
        name: item.name,
        imageUrl: item.image_url,
        upc: item.upc,
        quantity: 1,
        cheapest: false,
      };

      // set store specific parameters
      const lastIndex = item.stores[i].prices.length - 1;
      const currentPrice = item.stores[i].prices[lastIndex];
      strippedItem.price = currentPrice.price;
      strippedItem.upvotes = currentPrice.upvotes;
      strippedItem.downvotes = currentPrice.downvotes;

      if (strippedItem.price < cheapestPrice) {
        cheapestPrice = strippedItem.price;
        cheapestItem = strippedItem;
      }
      newStores[storeName].items.push(strippedItem);
    }

    // Find all stores that don't have the item
    Object.keys(newStores).forEach((store) => {
      if (!(allStoreNames.includes(store))) {
        // Adding infinite item
        const strippedItem = {
          name: item.name,
          imageUrl: item.image_url,
          upc: item.upc,
          quantity: 1,
          cheapest: false,
          price: Infinity,
          upvotes: 0,
          downvotes: 0,
        };
        newStores[store].items.push(strippedItem);
      }
    });


    cheapestItem.cheapest = true;

    this.setState({ stores: newStores }, () => { this.recalculateTotals(); });
  }

  /**
   * Calculates the total for a certain store (e.g. County Market)
   * @param  {string} storeName - the name of the store
   */
  calculateStoreTotal = (storeName) => {
    const { items } = this.state.stores[storeName];
    let sum = 0;
    for (let i = 0; i < items.length; i += 1) {
      sum += items[i].price;
    }
    return sum;
  }

  /**
   * Recalculate each store's totals and set the cheapest store accordingly
   */
  recalculateTotals = () => {
    let cheapestTotal = Number.MAX_VALUE;
    let cheapestStore = '';
    const self = this;
    Object.keys(this.state.stores).forEach((store) => {
      const storeTotal = self.calculateStoreTotal(store);
      if (storeTotal < cheapestTotal) {
        cheapestTotal = storeTotal;
        cheapestStore = store;
      }
    });

    // Set the state for the cheapest store
    this.setState({
      selectedStore: cheapestStore,
    });
  }

  selectStore = (store) => {
    this.setState({
      selectedStore: store,
    });
  }

  /**
   * Pop up an alert asking user if they want to delete an item
   * @param {number} i - the index of the item to be deleted
   */
  deleteAlert = (i) => {
    Alert.alert(
      'Delete',
      `Remove '${this.state.stores[this.state.selectedStore].items[i].name}' from your shopping list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'OK',
          onPress: () => this.deleteItem(i),
        },
      ],
      { cancelable: true },
    );
  }

  /**
   * Delete item with index i from shopping list
   * @param  {number} i - the index of the item to be deleted
   */
  deleteItem = (i) => {
    const newStores = Object.assign({}, this.state.stores);
    Object.keys(this.state.stores).forEach((store) => {
      newStores[store].items.splice(i, 1);
    });
    const promise = new Promise((resolve) => {
      this.setState({
        stores: newStores,
      }, () => {
        this.recalculateTotals();
        resolve();
      });
    });
    return promise;
  }

  /**
   * Navigates to the search results page with the given UPC and keyword
   * @param  {string} keyword - search parameter to use
   * @param  {string} upc - search parameter to use
   */
  submitSearch = async (keyword, upc) => {
    if (!keyword || (keyword && keyword.trim() !== '')) {
      this.props.navigation.navigate('SearchResults', { keyword: keyword.trim(), upc, handleAddItem: this.addItem });
    }
  }

  /**
   * This function simply navigates to the search results page
   * after a barcode is scanned
   * @param  {string} type - type of barcode
   * @param  {object} data - barcode data
   */
  handleBarCodeScanned = (type, data) => {
    this.submitSearch('', data);
  }

  /**
   * Called when the user clicks the camera icon to scan a UPC
   */
  scanBarCode = () => {
    this.props.navigation.navigate('Scan', { handleBarCodeScanned: this.handleBarCodeScanned });
  }

  /**
   * Launch the shopping page after clicking Finish List
   */
  launchShopping = () => {
    this.props.navigation.navigate('Shopping', {
      list: {
        name: this.props.navigation.getParam('name'),
        store: this.state.selectedStore,
        lat: this.state.stores[this.state.selectedStore].lat,
        long: this.state.stores[this.state.selectedStore].long,
        items: this.state.stores[this.state.selectedStore].items,
      },
    });
  }

  /**
   * Opens the compare collapsible
   */
  _onOpenCompare = () => {
    this.setState(state => ({ isCollapsed: !state.isCollapsed }));
  }

  /**
   * Renders the Search Page
   * @return {View} - the rendered search page view
   */
  render() {
    const TouchablePlatformSpecific = Platform.OS === 'ios'
      ? TouchableHighlight
      : TouchableNativeFeedback;

    if (this.state.selectedStore === '') {
      return (
        <View style={styles.container}>
          <ItemSearchBar onSearch={this.submitSearch} onPressCamera={this.scanBarCode} />

          <View style={styles.footer}>
            <ListItem
              title="Total (0) items"
              rightTitle="$0.00"
              topDivider
            />
          </View>
          <View>
            <Button
              icon={{
                name: 'check',
                size: 20,
                color: 'white',
              }}
              title="Finish Shopping List"
              iconRight
              onPress={() => { this.props.navigation.navigate('Shopping'); }}
            />
          </View>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <ItemSearchBar onSearch={this.submitSearch} onPressCamera={this.scanBarCode} />

        <ScrollView>
          {this.state.stores[this.state.selectedStore].items.map((l, i) => (
            <ListItem
              key={l.name + i}
              Component={TouchablePlatformSpecific}
              onLongPress={() => this.deleteAlert(i)}
              leftAvatar={{ title: l.name, source: { uri: l.imageUrl } }}
              title={l.name}
              rightTitle={this.state.stores[this.state.selectedStore].items[i].price !== Infinity ? `$${Number(this.state.stores[this.state.selectedStore].items[i].price).toFixed(2)}` : 'N/A'}
              rightTitleStyle={{ color: this.state.stores[this.state.selectedStore].items[i].cheapest ? 'green' : 'black' }}
              bottomDivider
            />
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <Icon name={this.state.isCollapsed ? 'expand-less' : 'expand-more'} type="material" />
          <ListItem
            title={`Total (${this.state.stores[this.state.selectedStore].items.length} items)`}
            subtitle={this.state.selectedStore}
            rightTitle={this.calculateStoreTotal(this.state.selectedStore) !== Infinity ? `$${Number(this.calculateStoreTotal(this.state.selectedStore)).toFixed(2)}` : 'N/A'}
            topDivider
            // eslint-disable-next-line no-underscore-dangle
            onPress={this._onOpenCompare}
          />

          <Collapsible collapsed={this.state.isCollapsed} duration={100} style={{ height: 140 }}>
            <View style={styles.horizontalRow}>
              {Object.keys(this.state.stores).map(key => (
                <View key={key}>
                  <Avatar
                    size="large"
                    overlayContainerStyle={this.state.selectedStore === key ? { borderWidth: 3, borderColor: 'green' } : { backgroundColor: '#BDBDBD' }}
                    rounded
                    onPress={() => this.selectStore(key)}
                    source={{
                      uri: storeLogos[key],
                    }}
                  />
                  {this.state.selectedStore === key
                    && (
                    <Badge
                      status="success"
                      containerStyle={{ position: 'absolute', top: -2, right: -2 }}
                    />
                    )
                  }
                  <Text style={styles.subtitle}>
                    {this.calculateStoreTotal(key) !== Infinity ? `$${Number(this.calculateStoreTotal(key)).toFixed(2)}` : 'N/A'}
                  </Text>
                </View>
              ))}
            </View>
          </Collapsible>
        </View>
        <View>
          <Button
            icon={{
              name: 'check',
              size: 20,
              color: 'white',
            }}
            title="Finish Shopping List"
            iconRight
            onPress={this.launchShopping}
          />
        </View>
        {this.state.refreshing
          && (
          <View style={styles.loading}>
            <ActivityIndicator size="large" />
          </View>
          )}
      </View>
    );
  }
}
